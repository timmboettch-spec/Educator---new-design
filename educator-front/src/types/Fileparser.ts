function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? '';
    });
    return row;
  });
}

export function parseFileToStudentArray(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseCSVText(e.target?.result as string));
        } catch {
          reject(new Error('Failed to parse CSV file.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      import('xlsx')
        .then(({ read, utils }) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              const workbook = read(data, { type: 'array' });
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              resolve(
                utils.sheet_to_json<Record<string, string>>(firstSheet, {
                  defval: '',
                  raw: false,
                }),
              );
            } catch {
              reject(new Error('Failed to parse Excel file.'));
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file.'));
          reader.readAsArrayBuffer(file);
        })
        .catch(() => reject(new Error('xlsx library missing. Run: npm install xlsx')));
    } else {
      reject(new Error('Unsupported file type.'));
    }
  });
}
