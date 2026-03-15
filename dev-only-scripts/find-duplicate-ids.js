const fs = require('fs');
const path = require('path');

const csv = require('csv-parser');

/**
 * Reads a Members Data CSV and finds duplicate memberIds: any memberId (memberId column)
 * that appears in more than one row. Outputs a JSON report with the list of
 * duplicate memberIds and, per memberId, the rows (e.g. ID, url) where it appears.
 *
 * Usage: node dev-only-scripts/find-duplicate-ids.js <path-to-csv> [output-json-path]
 *
 * CSV must have a "memberId" column (case-insensitive). Optional: "ID", "url" for row details.
 */
function findDuplicateMemberIds(csvFilePath, outputJsonPath) {
  if (!csvFilePath) {
    console.error('Error: CSV file path is required');
    console.error(
      'Usage: node dev-only-scripts/find-duplicate-ids.js <path-to-csv> [output-json-path]'
    );
    process.exit(1);
  }

  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: File not found: ${csvFilePath}`);
    process.exit(1);
  }

  const memberIdToRows = new Map(); // memberId -> [{ rowNumber, id?, url? }, ...]
  let totalRows = 0;
  let headersValidated = false;
  let headers = null;
  let memberIdColumnName = null;
  let idColumnName = null;
  let urlColumnName = null;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('headers', receivedHeaders => {
        headers = receivedHeaders;
        const normalizedHeaders = headers.map(h => {
          const normalized = String(h).trim().replace(/["']/g, '');
          return normalized.toLowerCase().trim();
        });

        const memberIdIndex = normalizedHeaders.indexOf('memberid');
        if (memberIdIndex === -1) {
          console.error('Error: CSV must contain a "memberId" column (case-insensitive)');
          console.error(`Found columns: ${headers.join(', ')}`);
          process.exit(1);
        }

        memberIdColumnName = headers[memberIdIndex];
        idColumnName = headers[normalizedHeaders.indexOf('id')] || null;
        urlColumnName = headers[normalizedHeaders.indexOf('url')] || null;
        headersValidated = true;
      })
      .on('data', row => {
        if (!headersValidated) {
          headers = Object.keys(row);
          const normalizedHeaders = headers.map(h => {
            const normalized = String(h).trim().replace(/["']/g, '');
            return normalized.toLowerCase().trim();
          });
          const memberIdIndex = normalizedHeaders.indexOf('memberid');
          if (memberIdIndex === -1) {
            console.error('Error: CSV must contain a "memberId" column (case-insensitive)');
            process.exit(1);
          }
          memberIdColumnName = headers[memberIdIndex];
          idColumnName = headers[normalizedHeaders.indexOf('id')] || null;
          urlColumnName = headers[normalizedHeaders.indexOf('url')] || null;
          headersValidated = true;
        }

        totalRows++;
        const memberId = row[memberIdColumnName];
        if (memberId == null || String(memberId).trim() === '') return;

        const trimmedMemberId = String(memberId).trim();
        const rowInfo = { rowNumber: totalRows };
        if (idColumnName && row[idColumnName] != null)
          rowInfo.id = String(row[idColumnName]).trim();
        if (urlColumnName && row[urlColumnName] != null)
          rowInfo.url = String(row[urlColumnName]).trim();

        if (!memberIdToRows.has(trimmedMemberId)) {
          memberIdToRows.set(trimmedMemberId, []);
        }
        memberIdToRows.get(trimmedMemberId).push(rowInfo);
      })
      .on('error', error => {
        console.error('Error reading CSV file:', error.message);
        reject(error);
      })
      .on('end', () => {
        if (!headersValidated) {
          console.error('Error: Could not read CSV headers');
          process.exit(1);
        }

        const groups = [];
        for (const [memberId, rows] of memberIdToRows.entries()) {
          if (rows.length > 1) {
            groups.push({ memberId, count: rows.length, rows });
          }
        }

        groups.sort((a, b) => b.count - a.count);

        const duplicateMemberIds = groups.map(g => g.memberId);
        const totalDuplicateRows = groups.reduce((sum, g) => sum + g.count, 0);

        const report = {
          totalRowsProcessed: totalRows,
          totalDuplicateMemberIds: groups.length,
          totalRowsWithDuplicateMemberIds: totalDuplicateRows,
          duplicateMemberIds,
          groups,
        };

        if (outputJsonPath) {
          fs.writeFileSync(outputJsonPath, JSON.stringify(report, null, 2), 'utf8');
          console.log(`Report written to: ${outputJsonPath}`);
        } else {
          const csvDir = path.dirname(csvFilePath);
          const csvBasename = path.basename(csvFilePath, path.extname(csvFilePath));
          const defaultPath = path.join(csvDir, `${csvBasename}-duplicate-member-ids-report.json`);
          fs.writeFileSync(defaultPath, JSON.stringify(report, null, 2), 'utf8');
          console.log(`Report written to: ${defaultPath}`);
        }

        console.log('\n=== Duplicate memberIds Report ===');
        console.log(`Total rows processed: ${totalRows}`);
        console.log(`memberIds that appear more than once: ${groups.length}`);
        console.log(`Total rows with those memberIds: ${totalDuplicateRows}`);
        if (groups.length > 0) {
          console.log('\nDuplicate memberIds (first 20):');
          groups.slice(0, 20).forEach((g, i) => {
            console.log(`  ${i + 1}. ${g.memberId} (${g.count} rows)`);
          });
        }

        resolve(report);
      });
  });
}

if (require.main === module) {
  const csvFilePath = process.argv[2];
  const outputJsonPath = process.argv[3];
  findDuplicateMemberIds(csvFilePath, outputJsonPath).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { findDuplicateMemberIds };
