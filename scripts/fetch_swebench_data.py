#!/usr/bin/env python3
"""
SWE-bench Dataset Fetcher

Fetches the official SWE-bench Lite dataset from Hugging Face and outputs it in a format
compatible with our TypeScript implementation.

Usage:
    python scripts/fetch_swebench_data.py [--output path] [--split test|dev]
"""

import json
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Any

try:
    from datasets import load_dataset
except ImportError:
    print("Error: 'datasets' library not found. Install with: pip install datasets")
    sys.exit(1)


def fetch_swebench_dataset(split: str = "test") -> List[Dict[str, Any]]:
    """
    Fetch the official SWE-bench Lite dataset from Hugging Face.
    
    Args:
        split: Dataset split to fetch ('test' or 'dev')
        
    Returns:
        List of problem instances matching official schema
    """
    print(f"Fetching SWE-bench Lite dataset (split: {split})...")
    
    try:
        # Load official dataset from Hugging Face
        dataset = load_dataset('princeton-nlp/SWE-bench_Lite', split=split)
        
        print(f"Successfully loaded {len(dataset)} instances")
        
        # Convert to list of dictionaries with validated schema
        problems = []
        for item in dataset:
            # Validate required fields exist
            required_fields = [
                'repo', 'instance_id', 'base_commit', 'patch', 'test_patch', 
                'problem_statement', 'hints_text', 'created_at', 'version'
            ]
            
            missing_fields = [field for field in required_fields if field not in item]
            if missing_fields:
                print(f"Warning: Instance {item.get('instance_id', 'unknown')} missing fields: {missing_fields}")
                continue
            
            # Create compliant problem instance
            problem = {
                'repo': item['repo'],
                'instance_id': item['instance_id'],
                'base_commit': item['base_commit'],
                'patch': item['patch'],
                'test_patch': item['test_patch'],
                'problem_statement': item['problem_statement'],
                'hints_text': item['hints_text'] or '',  # Handle None values
                'created_at': item['created_at'],
                'version': item['version']
            }
            
            problems.append(problem)
        
        print(f"Processed {len(problems)} valid instances")
        return problems
        
    except Exception as e:
        print(f"Error fetching dataset: {e}")
        sys.exit(1)


def validate_schema(problems: List[Dict[str, Any]]) -> bool:
    """
    Validate that all problems match the official SWE-bench schema.
    
    Args:
        problems: List of problem instances
        
    Returns:
        True if all instances are valid
    """
    print("Validating schema compliance...")
    
    required_fields = [
        'repo', 'instance_id', 'base_commit', 'patch', 'test_patch',
        'problem_statement', 'hints_text', 'created_at', 'version'
    ]
    
    errors = []
    for i, problem in enumerate(problems):
        # Check required fields
        missing = [field for field in required_fields if field not in problem]
        if missing:
            errors.append(f"Instance {i}: Missing fields {missing}")
        
        # Check data types
        if 'base_commit' in problem and len(problem['base_commit']) != 40:
            errors.append(f"Instance {i}: base_commit should be 40 characters")
        
        # Check for non-empty critical fields
        if 'instance_id' in problem and not problem['instance_id'].strip():
            errors.append(f"Instance {i}: instance_id cannot be empty")
    
    if errors:
        print("Schema validation errors:")
        for error in errors[:10]:  # Show first 10 errors
            print(f"  - {error}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more errors")
        return False
    
    print("✅ All instances pass schema validation")
    return True


def export_for_typescript(problems: List[Dict[str, Any]], output_path: Path):
    """
    Export problems in a format compatible with TypeScript implementation.
    
    Args:
        problems: List of validated problem instances
        output_path: Path to write the JSON file
    """
    print(f"Exporting {len(problems)} instances to {output_path}")
    
    # Create output directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSON with proper formatting
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(problems, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Successfully exported to {output_path}")


def generate_sample_predictions(problems: List[Dict[str, Any]], output_path: Path):
    """
    Generate sample predictions file showing the expected format.
    
    Args:
        problems: List of problem instances
        output_path: Path to write the predictions JSON file
    """
    print(f"Generating sample predictions file...")
    
    # Create sample predictions in official format
    predictions = {}
    for problem in problems[:5]:  # Just first 5 as examples
        predictions[problem['instance_id']] = {
            'model_name_or_path': 'swebench-swarm',
            'model_patch': f"# Sample patch for {problem['instance_id']}\n# TODO: Implement actual solution\n"
        }
    
    sample_path = output_path.parent / 'sample_predictions.json'
    with open(sample_path, 'w', encoding='utf-8') as f:
        json.dump(predictions, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Sample predictions exported to {sample_path}")


def main():
    parser = argparse.ArgumentParser(description='Fetch SWE-bench dataset from Hugging Face')
    parser.add_argument('--output', '-o', type=Path, 
                       default='implementation/.swebench-cache/swebench_lite.json',
                       help='Output JSON file path')
    parser.add_argument('--split', choices=['test', 'dev'], default='test',
                       help='Dataset split to fetch')
    parser.add_argument('--validate-only', action='store_true',
                       help='Only validate existing file, do not fetch')
    
    args = parser.parse_args()
    
    if args.validate_only:
        if not args.output.exists():
            print(f"Error: File {args.output} does not exist")
            sys.exit(1)
        
        with open(args.output, 'r') as f:
            problems = json.load(f)
        
        if validate_schema(problems):
            print("✅ Existing file passes validation")
        else:
            print("❌ Existing file has validation errors")
            sys.exit(1)
    else:
        # Fetch fresh data
        problems = fetch_swebench_dataset(args.split)
        
        # Validate schema
        if not validate_schema(problems):
            print("❌ Schema validation failed")
            sys.exit(1)
        
        # Export data
        export_for_typescript(problems, args.output)
        
        # Generate sample predictions
        generate_sample_predictions(problems, args.output)
        
        print(f"\n✅ SWE-bench dataset successfully fetched and validated!")
        print(f"📊 Dataset info:")
        print(f"   - Split: {args.split}")
        print(f"   - Instances: {len(problems)}")
        print(f"   - Output: {args.output}")
        print(f"   - Sample predictions: {args.output.parent / 'sample_predictions.json'}")


if __name__ == '__main__':
    main()