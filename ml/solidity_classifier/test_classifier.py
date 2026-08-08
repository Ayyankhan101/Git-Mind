"""
Test suite for Solidity vulnerability classifier.
Validates against known vulnerable contracts from SWC registry.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pure_classifier import PureSolidityClassifier


# ── Test cases from SWC registry ──────────────────────────────────────
TEST_CASES = [
    # SWC-107: Reentrancy
    {
        "name": "TheDAO-style reentrancy",
        "code": """contract Vault {
    mapping(address => uint256) balances;
    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent);
        balances[msg.sender] -= amount;
    }
}""",
        "expected": "reentrancy",
        "expected_severity": "critical",
    },
    # SWC-101: Integer Overflow
    {
        "name": "Pre-0.8 overflow",
        "code": """pragma solidity ^0.6.0;
contract Token {
    mapping(address => uint256) balances;
    function transfer(address to, uint256 amount) public {
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}""",
        "expected": "integer_overflow",
        "expected_severity": "high",
    },
    # SWC-105: Access Control
    {
        "name": "Missing onlyOwner",
        "code": """contract Admin {
    address public owner;
    constructor() { owner = msg.sender; }
    function changeOwner(address newOwner) public {
        owner = newOwner;
    }
}""",
        "expected": "access_control",
        "expected_severity": "high",
    },
    # SWC-104: Delegatecall
    {
        "name": "Delegatecall to user input",
        "code": """contract Proxy {
    address implementation;
    function execute(bytes calldata data) public {
        (bool ok, ) = implementation.delegatecall(data);
        require(ok);
    }
}""",
        "expected": "unsafe_external_call",
        "expected_severity": "high",
    },
    # SWC-114: Front-running
    {
        "name": "Bid without commit-reveal",
        "code": """contract Auction {
    address public highestBidder;
    uint256 public highestBid;
    function bid() public payable {
        require(msg.value > highestBid);
        highestBidder = msg.sender;
        highestBid = msg.value;
    }
}""",
        "expected": "front_running",
        "expected_severity": "medium",
    },
    # Safe: Proper pattern
    {
        "name": "ReentrancyGuard + Ownable",
        "code": """contract SafeVault is ReentrancyGuard, Ownable {
    mapping(address => uint256) balances;
    function withdraw(uint256 amount) public nonReentrant {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent);
    }
}""",
        "expected": "safe",
        "expected_severity": "none",
    },
    # Additional edge cases
    {
        "name": "Unchecked send",
        "code": """contract Send {
    function withdraw(address payable to, uint256 amount) public {
        to.send(amount);
    }
}""",
        "expected": "unsafe_external_call",
        "expected_severity": "high",
    },
    {
        "name": "Commit-reveal scheme",
        "code": """contract CommitReveal {
    mapping(bytes32 => uint256) commitments;
    function commitBid(bytes32 hash) public {
        commitments[hash] = msg.value;
    }
    function revealBid(uint256 amount, bytes32 salt) public {
        require(commitments[keccak256(abi.encodePacked(msg.sender, amount, salt))] > 0);
        require(amount == msg.value);
    }
}""",
        "expected": "safe",
        "expected_severity": "none",
    },
]


def run_tests():
    clf = PureSolidityClassifier()
    results = []

    print("=" * 70)
    print("Solidity Vulnerability Classifier — Test Suite")
    print("=" * 70)

    for i, test in enumerate(TEST_CASES, 1):
        result = clf.predict(test["code"])
        passed = result["label"] == test["expected"]

        status = "✓" if passed else "✗"
        print(f"\n{i}. {test['name']}")
        print(f"   Expected: {test['expected']} ({test['expected_severity']})")
        print(f"   Got:      {result['label']} ({result['severity']}) [{result['confidence']:.0%}]")
        print(f"   {status} {'PASS' if passed else 'FAIL'}")

        results.append({
            "test": test["name"],
            "passed": passed,
            "expected": test["expected"],
            "predicted": result["label"],
            "confidence": result["confidence"],
        })

    # Summary
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{'='*70}")
    print(f"Results: {passed}/{total} passed ({passed/total*100:.0f}%)")
    print("=" * 70)

    # Save results
    output_path = Path(__file__).parent / "output" / "test_results.json"
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w") as f:
        json.dump({"passed": passed, "total": total, "tests": results}, f, indent=2)

    return passed == total


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
