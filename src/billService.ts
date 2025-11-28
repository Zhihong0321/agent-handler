import { readFile } from 'fs/promises';
import path from 'path';

export interface BillRecord {
  kwh: number;
  bill_rm: number;
}

export interface BillReference {
  description: string;
  formula: string;
  columns: {
    kwh: string;
    bill_rm: string;
  };
  data: BillRecord[];
}

let cachedBillData: BillReference | null = null;

export async function getBillData(): Promise<BillReference> {
  if (cachedBillData) {
    return cachedBillData;
  }

  try {
    // bill.csv is in the project root
    const csvPath = path.join(process.cwd(), 'bill.csv');
    const fileContent = await readFile(csvPath, 'utf-8');
    
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    // Skip header (row 0)
    const dataRows = lines.slice(1);

    const records: BillRecord[] = [];

    for (const row of dataRows) {
        const trimmedRow = row.trim();
        const firstCommaIndex = trimmedRow.indexOf(',');
        
        if (firstCommaIndex !== -1) {
            const kwhStr = trimmedRow.substring(0, firstCommaIndex).trim();
            let billStr = trimmedRow.substring(firstCommaIndex + 1).trim();

            // Remove quotes if present
            if (billStr.startsWith('"') && billStr.endsWith('"')) {
                billStr = billStr.slice(1, -1);
            }

            // Remove 'RM' and commas for parsing
            billStr = billStr.replace(/RM/g, '').replace(/,/g, '');

            const kwh = parseInt(kwhStr, 10);
            const bill_rm = parseFloat(billStr);

            if (!isNaN(kwh) && !isNaN(bill_rm)) {
                records.push({ kwh, bill_rm });
            }
        }
    }

    cachedBillData = {
      description: "TNB Bill Reference Table",
      formula: "Kwh Usage = RM X Bill (Lookup Table)",
      columns: {
        kwh: "Monthly Total Usage (kWh)",
        bill_rm: "TNB Bill Total (RM)"
      },
      data: records
    };

    return cachedBillData;
  } catch (error) {
    console.error("Failed to read bill.csv:", error);
    // Return empty structure on error to avoid crashing
    return {
        description: "Error loading data",
        formula: "",
        columns: { kwh: "", bill_rm: "" },
        data: []
    };
  }
}
