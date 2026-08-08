"""
LoRA fine-tuning for Solidity vulnerability classifier using MLX.
"""
import json
from pathlib import Path

import mlx.core as mx
import mlx.optimizers as optim
from mlx_lm import load, generate
from mlx_lm.lora import linear_to_lora_layers, train as mlx_train, TrainingArgs
from mlx_lm.tuner.datasets import load_dataset


BASE_MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"
OUTPUT_DIR = Path(__file__).parent / "output"
DATA_DIR = Path(__file__).parent


def train():
    print("=" * 60)
    print("Solidity Vulnerability Classifier — LoRA Fine-tuning")
    print("=" * 60)

    data_path = DATA_DIR / "training_data.jsonl"
    if not data_path.exists():
        print("Run dataset.py first.")
        return

    with open(data_path) as f:
        examples = [json.loads(line) for line in f]
    print(f"Training examples: {len(examples)}")

    print(f"\nLoading {BASE_MODEL}...")
    model, tokenizer = load(BASE_MODEL)
    n_params = sum(p.size for p in model.parameters())
    print(f"Model loaded: {n_params / 1e6:.0f}M params")

    # Apply LoRA to attention layers
    lora_layers = ["q_proj", "v_proj"]
    for layer in model.layers:
        if hasattr(layer, "self_attn"):
            layer.self_attn = linear_to_lora_layers(
                layer.self_attn,
                linear_layers=lora_layers,
                rank=8,
                alpha=16,
                dropout=0.05,
            )

    trainable = sum(p.size for p in model.parameters() if p.requires_grad)
    print(f"Trainable: {trainable:,} / {n_params:,} ({trainable/n_params*100:.1f}%)")

    # Format dataset for chat
    OUTPUT_DIR.mkdir(exist_ok=True)
    formatted_path = OUTPUT_DIR / "formatted.jsonl"
    with open(formatted_path, "w") as out:
        for ex in examples:
            text = tokenizer.apply_chat_template(
                ex["messages"], tokenize=False, add_generation_prompt=False
            )
            out.write(json.dumps({"text": text}) + "\n")

    print(f"Formatted: {formatted_path}")

    # Train
    args = TrainingArgs(
        batch_size=2,
        iters=30,
        steps_per_report=5,
        steps_per_eval=20,
        adapter_file=str(OUTPUT_DIR / "adapters.safetensors"),
    )

    dataset = load_dataset(str(formatted_path), tokenizer)
    optimizer = optim.Adam(learning_rate=1e-4)

    print(f"\nTraining 30 steps...")
    mlx_train(
        model=model,
        optimizer=optimizer,
        train_dataset=dataset,
        args=args,
    )

    print(f"\nDone. Adapters: {OUTPUT_DIR / 'adapters.safetensors'}")

    # Test
    test_code = """contract Test {
    mapping(address => uint256) public balances;
    function withdraw(uint256 _amount) public {
        (bool sent, ) = msg.sender.call{value: _amount}("");
        require(sent);
        balances[msg.sender] -= _amount;
    }
}"""
    messages = [
        {"role": "system", "content": "Classify Solidity code as: reentrancy, integer_overflow, access_control, unsafe_external_call, front_running, gas_griefing, or safe. Respond JSON only."},
        {"role": "user", "content": f"```solidity\n{test_code}\n```"}
    ]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    response = generate(model, tokenizer, prompt=prompt, max_tokens=128, temp=0.1)
    print(f"\nTest: {response}")


if __name__ == "__main__":
    train()
