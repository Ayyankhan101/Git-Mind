"""
Labeled Solidity vulnerability dataset for LoRA fine-tuning.
Categories: reentrancy, integer_overflow, access_control, unsafe_external_call, front_running, gas_griefing, safe
"""

TRAINING_DATA = [
    # ── Reentrancy (SWC-107) ──────────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 _amount) public {
        require(balances[msg.sender] >= _amount);
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent, "Failed to send");
        balances[msg.sender] -= _amount;
    }
}""",
        "label": "reentrancy",
        "severity": "critical",
        "explanation": "External call to msg.sender before state update. Attacker can reenter withdraw() before balance decrements."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReentrancyERC20 {
    mapping(address => uint256) balances;

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount);
        (bool ok, ) = msg.sender.call{value: 0}("");
        require(ok);
        balances[msg.sender] -= amount;
    }
}""",
        "label": "reentrancy",
        "severity": "critical",
        "explanation": "ERC20-like pattern with callback before state change. Even without ETH transfer, malicious token contracts can reenter."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CrossFunctionReentrancy {
    mapping(address => uint256) public credit;
    mapping(address => bool) public claimed;

    function buyCredits() public payable {
        credit[msg.sender] += msg.value / 1 ether;
    }

    function claimReward() public {
        require(!claimed[msg.sender]);
        (bool sent, ) = msg.sender.call{value: credit[msg.sender] * 0.01 ether}("");
        require(sent);
        claimed[msg.sender] = true;
        credit[msg.sender] = 0;
    }
}""",
        "label": "reentrancy",
        "severity": "critical",
        "explanation": "Cross-function reentrancy: attacker can reenter buyCredits() during claimReward callback, inflating credit before zeroing."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReadVulnerability {
    mapping(address => uint256) public balances;

    function deposit() public payable { balances[msg.sender] += msg.value; }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function withdraw(uint256 _amount) public {
        require(balances[msg.sender] >= _amount);
        balances[msg.sender] -= _amount; // state change first
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent);
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Checks-effects-interactions pattern: state updated before external call. No reentrancy risk."
    },

    # ── Integer Overflow (SWC-101) ────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract OverflowToken {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) public {
        balances[from] -= amount;
        totalSupply -= amount;
    }
}""",
        "label": "integer_overflow",
        "severity": "high",
        "explanation": "Solidity 0.7 lacks built-in overflow checks. mint() can overflow balances mapping; burn() can underflow."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract OverflowAuction {
    uint256 public highestBid;
    address public highestBidder;

    function bid() public payable {
        require(msg.value > highestBid);
        uint256 refund = highestBid;
        highestBid = msg.value;
        highestBidder = msg.sender;
        (bool sent, ) = payable(msg.sender).call{value: refund}("");
        require(sent);
    }
}""",
        "label": "integer_overflow",
        "severity": "high",
        "explanation": "Pre-0.8.0 overflow possible on first bid (highestBid starts at 0, subtraction underflows). Refund sent before state properly validated."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeMathOld {
    mapping(address => uint256) public balances;

    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient");
        unchecked {
            balances[msg.sender] -= amount;
            balances[to] += amount;
        }
    }
}""",
        "label": "integer_overflow",
        "severity": "medium",
        "explanation": "Explicit unchecked block in 0.8+ disables overflow protection. balances[to] += amount can still overflow silently."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeArithmetic {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        require(msg.value > 0);
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient");
        balances[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Solidity 0.8+ with built-in overflow checks, no unchecked blocks, proper require guards."
    },

    # ── Access Control (SWC-105) ──────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UnprotectedOwner {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) public {
        owner = newOwner;
    }

    function withdraw() public {
        (bool sent, ) = owner.call{value: address(this).balance}("");
        require(sent);
    }
}""",
        "label": "access_control",
        "severity": "critical",
        "explanation": "transferOwnership has no access modifier. Any address can claim ownership and drain funds."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TxOriginAuth {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() { owner = msg.sender; }

    function emergencyWithdraw() public {
        require(tx.origin == owner, "Not owner");
        (bool sent, ) = owner.call{value: address(this).balance}("");
        require(sent);
    }
}""",
        "label": "access_control",
        "severity": "high",
        "explanation": "Uses tx.origin for authorization instead of msg.sender. Phishing contract can call this via intermediate."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MissingAuth {
    address public admin;
    mapping(address => uint256) public balances;

    function setAdmin(address addr) public {
        admin = addr;
    }

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }

    function pause() public {
        // can pause but anyone can unpause by deploying new contract
    }
}""",
        "label": "access_control",
        "severity": "high",
        "explanation": "setAdmin and mint have no access control. Any user can mint tokens or change admin."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ProtectedVault {
    address public owner;
    bool private locked;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked);
        locked = true;
        _;
        locked = false;
    }

    constructor() { owner = msg.sender; }

    function withdraw(uint256 amount) public onlyOwner nonReentrant {
        require(address(this).balance >= amount);
        (bool sent, ) = owner.call{value: amount}("");
        require(sent);
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Proper onlyOwner modifier, nonReentrant guard, checks-effects-interactions pattern."
    },

    # ── Unsafe External Call (SWC-104) ────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UnsafeDelegatecall {
    address public implementation;
    address public owner;

    constructor(address _impl) {
        implementation = _impl;
        owner = msg.sender;
    }

    function execute(bytes calldata data) public {
        (bool ok, bytes memory ret) = implementation.delegatecall(data);
        require(ok);
    }
}""",
        "label": "unsafe_external_call",
        "severity": "critical",
        "explanation": "Unrestricted delegatecall allows attacker to execute arbitrary code in contract context, overwriting storage."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UnsafeSend {
    function withdraw(address payable to, uint256 amount) public {
        to.send(amount);
    }
}""",
        "label": "unsafe_external_call",
        "severity": "high",
        "explanation": "Uses .send() without checking return value. Failed transfers silently lose funds."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UnsafeTransfer {
    address public token;

    function transferTokens(address to, uint256 amount) public {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        // no return value check
    }
}""",
        "label": "unsafe_external_call",
        "severity": "high",
        "explanation": "Low-level call without checking return value. Token transfer could fail silently."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeTransfer {
    IERC20 public token;

    function transferTokens(address to, uint256 amount) public {
        require(address(token).code.length > 0, "No code");
        bool ok = token.transfer(to, amount);
        require(ok, "Transfer failed");
    }
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Uses high-level ERC20 interface with return value check. Safe transfer pattern."
    },

    # ── Front-Running (SWC-114) ───────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FrontRunnable {
    address public highestBidder;
    uint256 public highestBid;

    function bid() public payable {
        require(msg.value > highestBid);
        highestBidder = msg.sender;
        highestBid = msg.value;
    }
}""",
        "label": "front_running",
        "severity": "medium",
        "explanation": "No commit-reveal scheme. Miners/validators can see bid in mempool and front-run with higher bid."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CommitReveal {
    mapping(bytes32 => uint256) public commitments;
    mapping(address => uint256) public bids;
    address public highestBidder;
    uint256 public highestBid;

    function commitBid(bytes32 hash) public {
        commitments[hash] = msg.value;
    }

    function revealBid(uint256 amount, bytes32 salt) public {
        require(commitments[keccak256(abi.encodePacked(msg.sender, amount, salt))] > 0);
        require(amount == msg.value);
        require(amount > highestBid);
        highestBidder = msg.sender;
        highestBid = amount;
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Commit-reveal scheme prevents front-running. Bid amount hidden until reveal phase."
    },

    # ── Gas Griefing (SWC-113) ────────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GasGriefing {
    mapping(address => uint256) public balances;

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) public {
        for (uint256 i = 0; i < recipients.length; i++) {
            balances[recipients[i]] += amounts[i];
        }
    }

    function drainGas() public {
        // unbounded loop with external calls
        for (uint256 i = 0; i < 1000; i++) {
            (bool sent, ) = msg.sender.call{value: 0}("");
            require(sent);
        }
    }
}""",
        "label": "gas_griefing",
        "severity": "medium",
        "explanation": "Unbounded loops allow gas exhaustion attacks. batchTransfer with large arrays can hit block gas limit."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SafeBatch {
    mapping(address => uint256) public balances;

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) public {
        require(recipients.length == amounts.length);
        require(recipients.length <= 100, "Too many"); // bounded
        for (uint256 i = 0; i < recipients.length; i++) {
            balances[recipients[i]] += amounts[i];
        }
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Bounded loop with explicit length check. Gas usage is predictable."
    },

    # ── Uninitialized Storage (SWC-120) ───────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UninitializedStorage {
    struct Vault {
        address owner;
        uint256 balance;
    }

    mapping(bytes32 => Vault) public vaults;

    function createVault(bytes32 id) public {
        Vault storage v = vaults[id];
        v.owner = msg.sender;
        v.balance = 0;
    }

    function getVault(bytes32 id) public view returns (address, uint256) {
        Vault storage v;
        return (v.owner, v.balance);
    }
}""",
        "label": "unsafe_external_call",
        "severity": "high",
        "explanation": "Uninitialized local storage pointer 'v' in getVault points to slot 0, leaking arbitrary storage."
    },

    # ── Signature Replay (SWC-122) ────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReplayAttack {
    mapping(address => uint256) public nonces;

    function execute(address to, uint256 value, bytes memory sig) public {
        bytes32 hash = keccak256(abi.encodePacked(to, value));
        address signer = ECDSA.recover(hash, sig);
        require(signer == owner);
        // no nonce increment
        (bool sent, ) = to.call{value: value}("");
        require(sent);
    }
}""",
        "label": "unsafe_external_call",
        "severity": "high",
        "explanation": "Signature not bound to nonce. Valid signature can be replayed multiple times."
    },

    # ── Timestamp Dependence (SWC-116) ────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TimeBomb {
    uint256 public deadline;
    address public beneficiary;

    function claimReward() public {
        require(block.timestamp >= deadline);
        (bool sent, ) = beneficiary.call{value: address(this).balance}("");
        require(sent);
    }

    function setDeadline(uint256 _deadline) public {
        deadline = _deadline;
    }
}""",
        "label": "front_running",
        "severity": "medium",
        "explanation": "Relies on block.timestamp for critical logic. Miners can manipulate timestamp within ~15 seconds."
    },

    # ── Selfdestruct (SWC-106) ────────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SelfDestructTrap {
    address public owner;

    constructor() { owner = msg.sender; }

    function destroy() public {
        require(msg.sender == owner);
        selfdestruct(payable(msg.sender));
    }

    receive() external payable {}
}""",
        "label": "access_control",
        "severity": "high",
        "explanation": "selfdestruct can force-send ETH to any address, breaking contracts that depend on address(this).balance."
    },

    # ── Low-level call with value (SWC-104) ───────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LowLevelCall {
    function execute(address to, bytes memory data) public payable {
        (bool ok, bytes memory ret) = to.call{value: msg.value}(data);
        require(ok, "Call failed");
    }
}""",
        "label": "unsafe_external_call",
        "severity": "high",
        "explanation": "Arbitrary low-level call with ETH forwarding. Can be used for delegatecall exploitation or force-sending ETH."
    },

    # ── Additional safe patterns ───────────────────────────────────────
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ProperDeFi is ReentrancyGuard, Ownable {
    mapping(address => uint256) public deposits;

    function deposit() public payable nonReentrant {
        deposits[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) public nonReentrant {
        require(deposits[msg.sender] >= amount);
        deposits[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");
    }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Uses OpenZeppelin ReentrancyGuard and Ownable. Follows checks-effects-interactions."
    },
    {
        "code": """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PausableVault is Ownable {
    bool public paused;
    mapping(address => uint256) public balances;

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    function deposit() public payable whenNotPaused {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) public whenNotPaused {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent);
    }

    function pause() public onlyOwner { paused = true; }
    function unpause() public onlyOwner { paused = false; }
}""",
        "label": "safe",
        "severity": "none",
        "explanation": "Pausable with onlyOwner control, checks-effects-interactions, proper access control."
    },
]

VULNERABILITY_CATEGORIES = {
    "reentrancy": {
        "name": "Reentrancy",
        "swc": "SWC-107",
        "description": "External call before state update allows recursive calls"
    },
    "integer_overflow": {
        "name": "Integer Overflow/Underflow",
        "swc": "SWC-101",
        "description": "Arithmetic operation exceeds type bounds"
    },
    "access_control": {
        "name": "Access Control",
        "swc": "SWC-105",
        "description": "Missing or incorrect authorization checks"
    },
    "unsafe_external_call": {
        "name": "Unsafe External Call",
        "swc": "SWC-104",
        "description": "Unchecked or dangerous low-level calls"
    },
    "front_running": {
        "name": "Front-Running / MEV",
        "swc": "SWC-114",
        "description": "Transaction order dependence exploitable by miners"
    },
    "gas_griefing": {
        "name": "Gas Griefing",
        "swc": "SWC-113",
        "description": "Unbounded loops or excessive gas consumption"
    },
    "safe": {
        "name": "Safe",
        "swc": None,
        "description": "No critical vulnerabilities detected"
    }
}

def format_for_lora(example):
    """Format a single example for LoRA chat fine-tuning."""
    system_msg = (
        "You are a Solidity vulnerability classifier. Analyze the given Solidity code "
        "and classify it into exactly one category: reentrancy, integer_overflow, access_control, "
        "unsafe_external_call, front_running, gas_griefing, or safe. "
        "Respond with JSON: {\"label\": \"<category>\", \"severity\": \"<severity>\", \"explanation\": \"<brief explanation>\"}"
    )

    user_msg = f"Classify this Solidity code:\n\n```solidity\n{example['code']}\n```"

    assistant_msg = (
        f'{{"label": "{example["label"]}", '
        f'"severity": "{example["severity"]}", '
        f'"explanation": "{example["explanation"]}"}}'
    )

    return {
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": assistant_msg}
        ]
    }


def augment_dataset():
    """Generate augmented variations for more training data."""
    augmented = []

    # Common variable name swaps for data augmentation
    var_swaps = [
        ("balances", "balancesOf"),
        ("msg.sender", "msg.sender"),
        ("_amount", "amount"),
        ("sent", "success"),
    ]

    for item in TRAINING_DATA:
        augmented.append(item)

        # Create 1-2 variations per example
        code = item["code"]
        for old, new in var_swaps[:1]:
            if old in code:
                variant = item.copy()
                variant["code"] = code.replace(old, new, 1)
                augmented.append(variant)

    return augmented


if __name__ == "__main__":
    data = augment_dataset()
    formatted = [format_for_lora(d) for d in data]

    print(f"Dataset: {len(formatted)} examples")
    print(f"Categories: {set(d['label'] for d in data)}")
    print(f"Distribution:")
    from collections import Counter
    dist = Counter(d["label"] for d in data)
    for cat, count in sorted(dist.items()):
        print(f"  {cat}: {count}")

    # Save as JSONL
    import json
    with open("training_data.jsonl", "w") as f:
        for item in formatted:
            f.write(json.dumps(item) + "\n")

    print(f"\nSaved training_data.jsonl ({len(formatted)} lines)")
