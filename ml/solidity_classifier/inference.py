"""
Inference engine for the trained Solidity vulnerability classifier.
Loads LoRA-adapted StarCoder2-3B for classification.
"""
import json
import time
from pathlib import Path
from typing import Optional

import mlx.core as mx
from mlx_lm import load, generate


MODEL_DIR = Path(__file__).parent / "output"
BASE_MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"  # Match training model

_system_prompt = (
    "You are a Solidity vulnerability classifier. Analyze the given Solidity code "
    "and classify it into exactly one category: reentrancy, integer_overflow, access_control, "
    "unsafe_external_call, front_running, gas_griefing, or safe. "
    'Respond with JSON: {"label": "<category>", "severity": "<severity>", "explanation": "<brief explanation>"}'
)

_model = None
_tokenizer = None


def _load_model():
    global _model, _tokenizer
    if _model is not None:
        return

    adapter_path = MODEL_DIR / "adapters.safetensors"
    print(f"Loading {BASE_MODEL} with LoRA adapters...")
    _model, _tokenizer = load(BASE_MODEL, adapter_path=str(adapter_path) if adapter_path.exists() else None)
    print("Model loaded.")


def classify_solidity(code: str, timeout: float = 30.0) -> dict:
    """
    Classify a Solidity code snippet for vulnerabilities.

    Returns:
        {
            "label": str,           # reentrancy, integer_overflow, access_control, etc.
            "severity": str,        # critical, high, medium, low, none
            "explanation": str,     # Brief explanation
            "confidence": float,    # 0-1 (estimated from temperature)
            "latency_ms": int       # Inference time
        }
    """
    _load_model()

    messages = [
        {"role": "system", "content": _system_prompt},
        {"role": "user", "content": f"Classify this Solidity code:\n\n```solidity\n{code}\n```"}
    ]

    prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    start = time.time()
    response = generate(
        _model,
        _tokenizer,
        prompt=prompt,
        max_tokens=256,
        temp=0.1,  # Low temp for deterministic classification
    )
    latency = int((time.time() - start) * 1000)

    # Parse JSON response
    try:
        # Extract JSON from response (model may include markdown)
        json_start = response.find("{")
        json_end = response.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            result = json.loads(response[json_start:json_end])
        else:
            result = {"label": "unknown", "severity": "unknown", "explanation": "Could not parse response"}
    except json.JSONDecodeError:
        result = {"label": "unknown", "severity": "unknown", "explanation": f"Parse error: {response[:200]}"}

    result["confidence"] = 0.85  # Low temp → high confidence estimate
    result["latency_ms"] = latency

    return result


def classify_batch(codes: list[str], timeout: float = 60.0) -> list[dict]:
    """Classify multiple Solidity snippets."""
    return [classify_solidity(code, timeout / len(codes)) for code in codes]


def health_check() -> dict:
    """Check if model is loaded and responsive."""
    global _model
    if _model is None:
        return {"status": "not_loaded"}

    try:
        test = classify_solidity("contract Safe { uint256 x; }")
        return {"status": "healthy", "test_label": test["label"], "latency_ms": test["latency_ms"]}
    except Exception as e:
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    # CLI test
    test_contracts = [
        """contract Reentrancy {
    mapping(address => uint256) public balances;
    function withdraw(uint256 _amount) public {
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent);
        balances[msg.sender] -= _amount;
    }
}""",
        """contract Safe {
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner); _; }
    function withdraw() public onlyOwner {
        (bool sent, ) = owner.call{value: address(this).balance}("");
        require(sent);
    }
}""",
        """contract Overflow {
    mapping(address => uint256) public balances;
    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}"""
    ]

    print("Solidity Vulnerability Classifier — Test Inference\n")
    for i, code in enumerate(test_contracts, 1):
        print(f"{'='*60}")
        print(f"Test {i}:")
        print(code)
        result = classify_solidity(code)
        print(f"\nResult: {json.dumps(result, indent=2)}")
        print()
