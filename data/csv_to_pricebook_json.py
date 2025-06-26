import csv
import json

# === Configuration ===
PRICEBOOKENTRY_CSV = "data/dummy-priceBookEntires.csv"
PRICEBOOKENTRY_JSON = "data/dummy-pricebookentries.json"
REAL_PRICEBOOK_ID = "01sJW000009KmOHYA0"  # Replace with your actual Pricebook2Id

records = []

# === Step 2: Generate PricebookEntry JSON ===
with open(PRICEBOOKENTRY_CSV, mode='r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    for index, row in enumerate(reader, start=1):
        unit_price_raw = row.get("UnitPrice", "0").replace(",", ".")
        try:
            unit_price = float(unit_price_raw)
        except ValueError:
            unit_price = 0.0

        reference_id = f"PricebookEntryRef{index}"
        product_ref = f"@ProductRef{index}"

        record = {
            "attributes": {
                "type": "PricebookEntry",
                "referenceId": reference_id
            },
            "Pricebook2Id": REAL_PRICEBOOK_ID,
            "Product2Id": product_ref,
            "UnitPrice": unit_price,
            "IsActive": row.get("IsActive", "").strip().lower() == "true",
            "UseStandardPrice": row.get("UseStandardPrice", "").strip().lower() == "true"
        }
        records.append(record)

output_data = { "records": records }

with open(PRICEBOOKENTRY_JSON, "w", encoding="utf-8") as f:
    json.dump(output_data, f, indent=2)

print(f"✅ {len(records)} pricebook entries written to {PRICEBOOKENTRY_JSON}")
