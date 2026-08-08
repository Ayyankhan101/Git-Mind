"""
Pure-Python Solidity vulnerability classifier.
Zero external ML dependencies. Rule-based + TF-IDF-like scoring.
"""
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional


# ── Vulnerability signatures ──────────────────────────────────────────
SIGNATURES = {
    "reentrancy": {
        "patterns": [
            (r"\.call\{.*value:.*\}\(", 3),
            (r"\.call\(.*value:.*\)", 3),
            (r"msg\.sender\.call\{", 3),
            (r"\(bool\s+\w+,.*\)\s*=\s*msg\.sender\.call", 2),
        ],
        "anti_patterns": [
            (r"balances\[.*\]\s*-=[\s\S]*?\.call", -5),  # state before call = safe
            (r"nonReentrant", -5),
            (r"ReentrancyGuard", -5),
        ],
        "swc": "SWC-107",
        "severity": "critical",
    },
    "integer_overflow": {
        "patterns": [
            (r"pragma solidity \^0\.[67]", 3),
            (r"unchecked\s*\{", 3),
            (r"\w+\s*\+=\s*\w+\s*\*\s*\w+", 2),
            (r"\w+\s*\*=\s*\w+\s*\*", 2),
        ],
        "anti_patterns": [
            (r"pragma solidity \^0\.8", -3),  # 0.8+ has built-in checks
        ],
        "swc": "SWC-101",
        "severity": "high",
    },
    "access_control": {
        "patterns": [
            (r"tx\.origin", 5),
            (r"function\s+transferOwnership\([^)]*\)\s+public(?!\s+onlyOwner)", 5),
            (r"owner\s*=\s*msg\.sender(?!.*require)", 3),
            (r"function\s+setAdmin\([^)]*\)\s+public", 3),
            (r"function\s+mint\([^)]*\)\s+public(?!.*onlyOwner)", 2),
        ],
        "anti_patterns": [
            (r"require\(msg\.sender\s*==\s*owner\)", -5),
            (r"modifier\s+onlyOwner", -3),
        ],
        "swc": "SWC-105",
        "severity": "high",
    },
    "unsafe_external_call": {
        "patterns": [
            (r"\.delegatecall\(", 3),
            (r"\.send\((?!.*require)", 2),
            (r"abi\.encodePacked\(", 1),
            (r"\.call\(", 1),
        ],
        "anti_patterns": [
            (r"\.call\(.*\).*require\(ok\)", -2),
            (r"\.call\(.*\).*require\(sent\)", -2),
        ],
        "swc": "SWC-104",
        "severity": "high",
    },
    "front_running": {
        "patterns": [
            (r"block\.timestamp\s*[><=]", 2),
            (r"highestBid", 2),
            (r"commit.*reveal", -2),  # commit-reveal = safe
        ],
        "anti_patterns": [
            (r"commit.*reveal", -3),
            (r"keccak256.*abi\.encode.*msg\.sender", -2),  # commit scheme
        ],
        "swc": "SWC-114",
        "severity": "medium",
    },
    "gas_griefing": {
        "patterns": [
            (r"for\s*\(\s*uint256\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\.length", 2),
            (r"\.length\s*>\s*100", 2),
            (r"while\s*\(\s*true\s*\)", 3),
        ],
        "anti_patterns": [
            (r"require\(\w+\.length\s*<=\s*\d+\)", -3),
            (r"require\(\w+\.length\s*==\s*\w+\.length\)", -2),
        ],
        "swc": "SWC-113",
        "severity": "medium",
    },
}

SAFE_PATTERNS = [
    (r"require\(msg\.sender\s*==\s*owner\)", 3),
    (r"modifier\s+onlyOwner", 3),
    (r"nonReentrant", 5),
    (r"ReentrancyGuard", 5),
    (r"balances\[.*\]\s*-=[\s\S]*?\.call", 5),  # checks-effects-interactions
    (r"commit.*reveal", 5),  # commit-reveal scheme
    (r"require\(\w+\.length\s*<=\s*\d+\)", 5),  # bounded loop
    (r"import.*@openzeppelin", 3),
]


class PureSolidityClassifier:
    """Rule-based classifier with scoring. No ML dependencies."""

    def __init__(self):
        self._scores = defaultdict(float)

    def _score_vulnerability(self, code: str, vuln_type: str) -> float:
        """Score code for a specific vulnerability type."""
        sig = SIGNATURES[vuln_type]
        score = 0.0

        for pattern, weight in sig["patterns"]:
            matches = re.findall(pattern, code, re.IGNORECASE | re.DOTALL)
            score += len(matches) * weight

        for pattern, weight in sig.get("anti_patterns", []):
            matches = re.findall(pattern, code, re.IGNORECASE | re.DOTALL)
            score += len(matches) * weight

        return score

    def _score_safe(self, code: str) -> float:
        """Score how safe the code is."""
        score = 0.0
        for pattern, weight in SAFE_PATTERNS:
            matches = re.findall(pattern, code, re.IGNORECASE | re.DOTALL)
            score += len(matches) * weight
        return score

    def predict(self, code: str) -> dict:
        """Classify a Solidity code snippet."""
        scores = {}
        for vuln_type in SIGNATURES:
            scores[vuln_type] = self._score_vulnerability(code, vuln_type)

        safe_score = self._score_safe(code)

        # Find best vulnerability
        best_vuln = max(scores, key=scores.get)
        best_score = scores[best_vuln]

        # If no strong signals or safe patterns dominate
        if best_score <= 0 or safe_score > best_score:
            return {
                "label": "safe",
                "severity": "none",
                "explanation": "No vulnerability patterns detected. Code follows security best practices.",
                "confidence": min(0.9, 0.5 + safe_score * 0.1),
                "scores": dict(scores),
            }

        # Vulnerability found
        explanations = {
            "reentrancy": "External call before state update allows recursive reentry",
            "integer_overflow": "Arithmetic may overflow/underflow without proper checks",
            "access_control": "Missing authorization allows unauthorized access",
            "unsafe_external_call": "Unchecked or dangerous low-level call detected",
            "front_running": "Transaction order dependence exploitable by miners",
            "gas_griefing": "Unbounded loop may cause gas exhaustion",
        }

        swc_map = {v["swc"]: k for k, v in SIGNATURES.items()}

        confidence = min(0.95, 0.5 + best_score * 0.1)

        return {
            "label": best_vuln,
            "severity": SIGNATURES[best_vuln]["severity"],
            "explanation": explanations.get(best_vuln, "Vulnerability detected"),
            "confidence": confidence,
            "swc": SIGNATURES[best_vuln]["swc"],
            "scores": dict(scores),
        }

    def predict_contract(self, code: str) -> dict:
        """Analyze a full contract, finding multiple vulnerabilities."""
        findings = []

        # Check each vulnerability type
        for vuln_type, sig in SIGNATURES.items():
            score = self._score_vulnerability(code, vuln_type)
            if score > 0:
                # Try to extract function name
                func_match = re.search(r"function\s+(\w+)", code)
                func_name = func_match.group(1) if func_match else "N/A"

                findings.append({
                    "label": vuln_type,
                    "severity": sig["severity"],
                    "swc": sig["swc"],
                    "function": func_name,
                    "score": score,
                })

        # Check overall safety
        safe_score = self._score_safe(code)

        return {
            "findings": sorted(findings, key=lambda x: x["score"], reverse=True),
            "safe_score": safe_score,
            "is_safe": len(findings) == 0 or safe_score > max((f["score"] for f in findings), default=0),
        }


# ── Dataset training (TF-IDF-like) ───────────────────────────────────
class TfidfPureClassifier:
    """TF-IDF style classifier with naive Bayes, pure Python."""

    def __init__(self, ngram_range=(3, 5), max_features=500):
        self.ngram_range = ngram_range
        self.max_features = max_features
        self.vocab = {}
        self.idf = {}
        self.class_priors = {}
        self.class_likelihoods = defaultdict(Counter)
        self._fitted = False

    def _tokenize(self, text: str) -> list[str]:
        """Character n-gram tokenization."""
        tokens = []
        for n in range(self.ngram_range[0], self.ngram_range[1] + 1):
            for i in range(len(text) - n + 1):
                tokens.append(text[i:i+n])
        return tokens

    def _tfidf_features(self, texts: list[str]) -> list[dict]:
        """Compute TF-IDF features."""
        # Build vocab from training data
        doc_freq = Counter()
        all_docs = []

        for text in texts:
            tokens = self._tokenize(text)
            all_docs.append(Counter(tokens))
            for token in set(tokens):
                doc_freq[token] += 1

        # Select top features by document frequency
        top_tokens = [t for t, _ in doc_freq.most_common(self.max_features)]
        self.vocab = {t: i for i, t in enumerate(top_tokens)}
        n_docs = len(texts)

        # Compute IDF
        self.idf = {}
        for token in self.vocab:
            self.idf[token] = math.log((n_docs + 1) / (doc_freq[token] + 1)) + 1

        # Compute TF-IDF for each document
        features = []
        for doc_counter in all_docs:
            tfidf = [0.0] * len(self.vocab)
            for token, count in doc_counter.items():
                if token in self.vocab:
                    tf = 1 + math.log(count) if count > 0 else 0
                    tfidf[self.vocab[token]] = tf * self.idf[token]
            # Normalize
            norm = math.sqrt(sum(x*x for x in tfidf)) or 1
            features.append([x/norm for x in tfidf])

        return features

    def _extract_handcrafted(self, code: str) -> list[float]:
        """Extract hand-crafted features."""
        features = []

        # Pattern match counts
        for vuln_type in SIGNATURES:
            score = 0
            for pattern, weight in SIGNATURES[vuln_type]["patterns"]:
                score += len(re.findall(pattern, code, re.IGNORECASE))
            features.append(score)

        # Code stats
        features.append(len(code) / 1000)  # normalized length
        features.append(code.count("function ") / 10)  # function density
        features.append(code.count("require(") / 5)  # require density
        features.append(1 if "selfdestruct" in code else 0)
        features.append(1 if "delegatecall" in code else 0)

        return features

    def train(self, codes: list[str], labels: list[str]):
        """Train the classifier."""
        # TF-IDF features
        tfidf_feats = self._tfidf_features(codes)

        # Handcrafted features
        hc_feats = [self._extract_handcrafted(code) for code in codes]

        # Combine
        X = [tf + hc for tf, hc in zip(tfidf_feats, hc_feats)]
        y = labels

        # Naive Bayes training
        n_features = len(X[0])
        classes = set(y)

        # Class priors
        n_total = len(y)
        label_counts = Counter(y)
        self.class_priors = {c: math.log(label_counts[c] / n_total) for c in classes}

        # Class likelihoods (Gaussian)
        self.class_means = {}
        self.class_vars = {}

        for c in classes:
            class_X = [X[i] for i in range(len(y)) if y[i] == c]
            n_class = len(class_X)

            means = [0.0] * n_features
            for x in class_X:
                for j in range(n_features):
                    means[j] += x[j]
            means = [m / n_class for m in means]

            vars_ = [0.001] * n_features  # smoothing
            for x in class_X:
                for j in range(n_features):
                    vars_[j] += (x[j] - means[j]) ** 2
            vars_ = [v / n_class + 1e-6 for v in vars_]

            self.class_means[c] = means
            self.class_vars[c] = vars_

        self._fitted = True
        print(f"Trained on {len(codes)} examples, {n_features} features, {len(classes)} classes")

    def _gaussian_log_likelihood(self, x: list[float], means: list[float], vars_: list[float]) -> float:
        """Compute log-likelihood under Gaussian distribution."""
        log_prob = 0.0
        for xi, mi, vi in zip(x, means, vars_):
            log_prob += -0.5 * math.log(2 * math.pi * vi) - 0.5 * ((xi - mi) ** 2) / vi
        return log_prob

    def predict(self, code: str) -> dict:
        """Classify a code snippet."""
        if not self._fitted:
            return {"label": "unknown", "confidence": 0.0}

        # Features
        tfidf = [0.0] * len(self.vocab)
        tokens = self._tokenize(code)
        token_counts = Counter(tokens)
        for token, count in token_counts.items():
            if token in self.vocab:
                tf = 1 + math.log(count) if count > 0 else 0
                tfidf[self.vocab[token]] = tf * self.idf.get(token, 1.0)
        norm = math.sqrt(sum(x*x for x in tfidf)) or 1
        tfidf = [x/norm for x in tfidf]

        hc = self._extract_handcrafted(code)
        x = tfidf + hc

        # Predict
        log_probs = {}
        for c in self.class_priors:
            log_probs[c] = self.class_priors[c] + self._gaussian_log_likelihood(
                x, self.class_means[c], self.class_vars[c]
            )

        best_class = max(log_probs, key=log_probs.get)
        total = sum(math.exp(p) for p in log_probs.values())
        confidence = math.exp(log_probs[best_class]) / total

        severity_map = {
            "reentrancy": "critical",
            "integer_overflow": "high",
            "access_control": "high",
            "unsafe_external_call": "high",
            "front_running": "medium",
            "gas_griefing": "medium",
            "safe": "none",
        }

        return {
            "label": best_class,
            "severity": severity_map.get(best_class, "medium"),
            "confidence": min(0.95, confidence),
            "swc": SIGNATURES.get(best_class, {}).get("swc"),
        }


# ── Main ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Quick test
    clf = PureSolidityClassifier()

    tests = [
        ("Reentrancy", """contract Test {
    mapping(address => uint256) public balances;
    function withdraw(uint256 _amount) public {
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent);
        balances[msg.sender] -= _amount;
    }
}"""),
        ("Safe", """contract Safe is ReentrancyGuard, Ownable {
    mapping(address => uint256) public balances;
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent);
    }
}"""),
        ("Overflow", """pragma solidity ^0.7.0;
contract Overflow {
    mapping(address => uint256) public balances;
    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}"""),
        ("Access Control", """contract Unprotected {
    address public owner;
    function transferOwnership(address newOwner) public {
        owner = newOwner;
    }
}"""),
    ]

    print("Solidity Vulnerability Classifier — Pure Python\n")
    for name, code in tests:
        result = clf.predict(code)
        print(f"{name}:")
        print(f"  Label: {result['label']}")
        print(f"  Severity: {result['severity']}")
        print(f"  Confidence: {result['confidence']:.0%}")
        print()
