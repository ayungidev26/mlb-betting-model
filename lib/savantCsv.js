export function parseCsvRow(line) {
  const cells = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (char === "," && !inQuotes) {
      cells.push(current)
      current = ""
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

export function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = parseCsvRow(lines[0]).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const values = parseCsvRow(line)
    const row = {}

    headers.forEach((header, index) => {
      row[header] = values[index] ?? ""
    })

    return row
  })
}

export function readAdvancedMetric(row, ...keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key]
    }
  }

  return null
}
