"""
Lightweight Solidity vulnerability classifier using TF-IDF + RandomForest.
No model download needed. Instant inference.
"""
import json
import re
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
import joblib


MODEL_DIR = Path(__file__).parent / "output"

# ── Feature extraction ────────────────────────────────────────────────
VULN_PATTERNS = {
    "reentrancy": [
        r"\.call\{.*value:",
        r"\.call\(.*value:",
        r"balances\[.*\]\s*-=",
        r"require\(sent\)",
        r"msg\.sender\.call",
    ],
    "integer_overflow": [
        r"pragma solidity \^0\.[67]",
        r"\+=.*\*",
        r"unchecked\s*\{",
        r"\*\s*\*\s*10",
    ],
    "access_control": [
        r"tx\.origin",
        r"function\s+\w+\(\)\s+public(?!\s+(view|pure|onlyOwner))",
        r"owner\s*=\s*msg\.sender(?!.*require)",
    ],
    "unsafe_external_call": [
        r"\.delegatecall\(",
        r"\.call\(",
        r"\.send\(",
        r"abi\.encodePacked",
    ],
    "front_running": [
        r"block\.timestamp",
        r"highestBid",
        r"commit.*reveal",
    ],
    "gas_griefing": [
        r"for\s*\(\s*uint256\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\s*;",
        r"\.length\s*-\s*1",
    ],
}


def extract_features(code: str) -> dict:
    """Extract hand-crafted features from Solidity code."""
    features = {}

    # Pattern matches
    for vuln_type, patterns in VULN_PATTERNS.items():
        count = 0
        for pat in patterns:
            count += len(re.findall(pat, code, re.IGNORECASE))
        features[f"pattern_{vuln_type}"] = count

    # Code stats
    features["code_length"] = len(code)
    features["num_functions"] = len(re.findall(r"function\s+\w+", code))
    features["num_state_vars"] = len(re.findall(r"mapping|uint|int|address|bool", code))
    features["has_require"] = code.count("require(")
    features["has_modifier"] = code.count("modifier ")
    features["external_calls"] = code.count(".call") + code.count(".send") + code.count(".transfer")
    features["payable_count"] = code.count("payable")

    # Solidity version
    version_match = re.search(r"pragma solidity \^?0\.(\d+)", code)
    if version_match:
        features["sol_version"] = int(version_match.group(1))
    else:
        features["sol_version"] = 8

    # Dangerous patterns
    features["has_selfdestruct"] = 1 if "selfdestruct" in code else 0
    features["has_delegatecall"] = 1 if "delegatecall" in code else 0
    features["state_before_call"] = 1 if re.search(r"\w+\[.*\]\s*-=\s*.*;.*\.call", code, re.DOTALL) else 0
    features["call_before_state"] = 1 if re.search(r"\.call.*\w+\[.*\]\s*-=", code, re.DOTALL) else 0

    return features


class SolidityClassifier:
    """ML-based Solidity vulnerability classifier."""

    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=500,
            analyzer="char_wb",
            ngram_range=(3, 5),
            sublinear_tf=True,
        )
        self.label_encoder = LabelEncoder()
        self.classifier = GradientBoostingClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        self._fitted = False

    def _prepare_data(self, codes: list[str], labels: Optional[list[str]] = None):
        """Combine TF-IDF features with hand-crafted features."""
        tfidf_features = self.vectorizer.fit_transform(codes) if not self._fitted else self.vectorizer.transform(codes)

        handcrafted = np.array([list(extract_features(code).values()) for code in codes])

        combined = np.hstack([tfidf_features.toarray(), handcrafted])

        if labels is not None:
            encoded_labels = self.label_encoder.fit_transform(labels)
            return combined, encoded_labels
        return combined

    def train(self, codes: list[str], labels: list[str]):
        """Train the classifier."""
        X, y = self._prepare_data(codes, labels)
        self.classifier.fit(X, y)
        self._fitted = True

        # Cross-validation score
        scores = cross_val_score(self.classifier, X, y, cv=min(5, len(codes)), scoring="accuracy")
        print(f"CV Accuracy: {scores.mean():.2f} (+/- {scores.std():.2f})")

        return scores.mean()

    def predict(self, code: str) -> dict:
        """Classify a single code snippet."""
        if not self._fitted:
            return {"label": "unknown", "severity": "unknown", "explanation": "Model not trained"}

        X = self._prepare_data([code])
        pred = self.classifier.predict(X)[0]
        proba = self.classifier.predict_proba(X)[0]
        label = self.label_encoder.inverse_transform([pred])[0]

        # Get confidence
        max_proba = float(max(proba))

        severity_map = {
            "reentrancy": "critical",
            "integer_overflow": "high",
            "access_control": "high",
            "unsafe_external_call": "high",
            "front_running": "medium",
            "gas_griefing": "medium",
            "safe": "none",
        }

        explanations = {
            "reentrancy": "External call before state update allows recursive calls",
            "integer_overflow": "Arithmetic operation may exceed type bounds",
            "access_control": "Missing or incorrect authorization checks",
            "unsafe_external_call": "Unchecked or dangerous low-level call",
            "front_running": "Transaction order dependence exploitable",
            "gas_griefing": "Unbounded loop or excessive gas consumption",
            "safe": "No critical vulnerabilities detected",
        }

        return {
            "label": label,
            "severity": severity_map.get(label, "medium"),
            "explanation": explanations.get(label, ""),
            "confidence": max_proba,
        }

    def save(self, path: Optional[Path] = None):
        """Save model to disk."""
        path = path or MODEL_DIR / "classifier.joblib"
        path.parent.mkdir(exist_ok=True)
        joblib.dump({
            "vectorizer": self.vectorizer,
            "label_encoder": self.label_encoder,
            "classifier": self.classifier,
        }, path)
        print(f"Saved: {path}")

    def load(self, path: Optional[Path] = None):
        """Load model from disk."""
        path = path or MODEL_DIR / "classifier.joblib"
        if not path.exists():
            print(f"No model at {path}")
            return False

        data = joblib.load(path)
        self.vectorizer = data["vectorizer"]
        self.label_encoder = data["label_encoder"]
        self.classifier = data["classifier"]
        self._fitted = True
        print(f"Loaded: {path}")
        return True


# ── Training script ───────────────────────────────────────────────────
def train_from_dataset():
    """Train from the labeled dataset."""
    data_path = Path(__file__).parent / "training_data.jsonl"
    if not data_path.exists():
        print("Run dataset.py first.")
        return

    with open(data_path) as f:
        examples = [json.loads(line) for line in f]

    codes = [ex["code"] for ex in examples]
    labels = [ex["label"] for ex in examples]

    print(f"Training on {len(codes)} examples...")
    clf = SolidityClassifier()
    clf.train(codes, labels)
    clf.save()

    # Test
    test_cases = [
        ("Reentrancy", """contract Test {
    mapping(address => uint256) public balances;
    function withdraw(uint256 _amount) public {
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent);
        balances[msg.sender] -= _amount;
    }
}"""),
        ("Safe", """contract Safe {
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner); _; }
    function withdraw() public onlyOwner {
        (bool sent, ) = owner.call{value: address(this).balance}("");
        require(sent);
    }
}"""),
        ("Overflow", """contract Overflow {
    mapping(address => uint256) public balances;
    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}"""),
    ]

    print("\nTest predictions:")
    for name, code in test_cases:
        result = clf.predict(code)
        print(f"  {name}: {result['label']} ({result['confidence']:.0%})")


if __name__ == "__main__":
    train_from_dataset()
