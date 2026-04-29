export class DataTable {
  private readonly rawData: string[][]

  constructor(rawData: string[][]) {
    this.rawData = rawData
  }

  raw(): string[][] {
    return this.rawData
  }

  rows(): string[][] {
    return this.rawData.slice(1)
  }

  hashes<T extends Record<string, string> = Record<string, string>>(): T[] {
    const [headers, ...dataRows] = this.rawData
    if (!headers) return []

    return dataRows.map(row => {
      const obj: Record<string, string> = {}
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i].trim()] = row[i]?.trim() ?? ""
      }
      return obj as T
    })
  }

  rowsHash(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const row of this.rawData) {
      if (row.length >= 2) {
        result[row[0].trim()] = row[1].trim()
      }
    }
    return result
  }
}
