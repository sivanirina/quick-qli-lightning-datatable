import csv
import json

# === Configuration ===
PRODUCT_CSV = 'data/dummy-products.csv'   # Your input CSV file
PRODUCT_JSON = 'data/dummy-products.json'  # Desired output JSON file

records = []

# === Step 1: Generate Product2 JSON ===
with open(PRODUCT_CSV, mode='r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')  # <- important: semicolon used in your file
    for index, row in enumerate(reader, start=1):
        reference_id = f"ProductRef{index}"  # Unique referenceId for each product
        record = {
            "attributes": {
                "type": "Product2",
                "referenceId": reference_id
            },
            "ProductCode": row.get("ProductCode", "").strip(),
            "Name": row.get("Name", "").strip(),
            "Family": row.get("Family", "").strip(),
            "IsActive": row.get("IsActive", "").strip().lower() == "true"
        }
        records.append(record)

# Final output structure
output_data = { "records": records }

# Save to JSON
with open(PRODUCT_JSON, "w", encoding="utf-8") as f:
    json.dump(output_data, f, indent=2)

print(f"✅ {len(records)} products written to {PRODUCT_JSON}")
