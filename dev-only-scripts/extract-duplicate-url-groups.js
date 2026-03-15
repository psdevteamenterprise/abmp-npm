const fs = require('fs');
const path = require('path');

const csv = require('csv-parser');

/**
 * Reads a Members Data CSV and extracts groups of non-unique URLs:
 * each group is a URL plus the list of IDs and memberIds that share that URL.
 * Only outputs groups where the same URL appears more than once.
 * Report includes duplicateUrls, memberIdsWithDuplicateUrls (flat array of unique memberIds
 * in duplicate groups), and nonUniqueMemberIds (memberIds that appear more than once, with count).
 *
 * Usage: node dev-only-scripts/extract-duplicate-url-groups.js <path-to-csv> [output-json-path]
 * Example: node dev-only-scripts/extract-duplicate-url-groups.js "/Users/Besan/Downloads/Members+Data+Latest (17).csv"
 *
 * CSV must have columns: "url", "ID", and "memberId" (case-insensitive).
 */
function extractDuplicateUrlGroups(csvFilePath, outputJsonPath) {
  if (!csvFilePath) {
    console.error('Error: CSV file path is required');
    console.error(
      'Usage: node dev-only-scripts/extract-duplicate-url-groups.js <path-to-csv> [output-json-path]'
    );
    process.exit(1);
  }

  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: File not found: ${csvFilePath}`);
    process.exit(1);
  }

  const urlToRows = new Map(); // url -> [{ id, memberId }, ...]
  let totalRows = 0;
  let headersValidated = false;
  let headers = null;
  let urlColumnName = null;
  let idColumnName = null;
  let memberIdColumnName = null;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('headers', receivedHeaders => {
        headers = receivedHeaders;
        const normalizedHeaders = headers.map(h => {
          const normalized = String(h).trim().replace(/["']/g, '');
          return normalized.toLowerCase().trim();
        });

        const urlIndex = normalizedHeaders.indexOf('url');
        const idIndex = normalizedHeaders.indexOf('id');
        const memberIdIndex = normalizedHeaders.indexOf('memberid');

        if (urlIndex === -1 || idIndex === -1 || memberIdIndex === -1) {
          console.error(
            'Error: CSV must contain "url", "ID", and "memberId" columns (case-insensitive)'
          );
          console.error(`Found columns: ${headers.join(', ')}`);
          process.exit(1);
        }

        urlColumnName = headers[urlIndex];
        idColumnName = headers[idIndex];
        memberIdColumnName = headers[memberIdIndex];
        headersValidated = true;
      })
      .on('data', row => {
        if (!headersValidated) {
          headers = Object.keys(row);
          const normalizedHeaders = headers.map(h => {
            const normalized = String(h).trim().replace(/["']/g, '');
            return normalized.toLowerCase().trim();
          });
          const urlIndex = normalizedHeaders.indexOf('url');
          const idIndex = normalizedHeaders.indexOf('id');
          const memberIdIndex = normalizedHeaders.indexOf('memberid');
          if (urlIndex === -1 || idIndex === -1 || memberIdIndex === -1) {
            console.error(
              'Error: CSV must contain "url", "ID", and "memberId" columns (case-insensitive)'
            );
            process.exit(1);
          }
          urlColumnName = headers[urlIndex];
          idColumnName = headers[idIndex];
          memberIdColumnName = headers[memberIdIndex];
          headersValidated = true;
        }

        totalRows++;

        const url = row[urlColumnName];
        const id = row[idColumnName];
        const memberId = row[memberIdColumnName];

        if (!url || !id) {
          return;
        }

        const trimmedUrl = url.trim();
        const trimmedId = id.trim();
        const trimmedMemberId =
          memberId != null && String(memberId).trim() !== '' ? String(memberId).trim() : null;

        if (!urlToRows.has(trimmedUrl)) {
          urlToRows.set(trimmedUrl, []);
        }
        urlToRows.get(trimmedUrl).push({ id: trimmedId, memberId: trimmedMemberId });
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
        for (const [url, rows] of urlToRows.entries()) {
          if (rows.length > 1) {
            const ids = rows.map(r => r.id);
            const memberIds = rows.map(r => r.memberId).filter(Boolean);
            groups.push({ url, ids, memberIds });
          }
        }

        groups.sort((a, b) => {
          if (b.ids.length !== a.ids.length) return b.ids.length - a.ids.length;
          return a.url.localeCompare(b.url);
        });

        const totalIdsInGroups = groups.reduce((sum, g) => sum + g.ids.length, 0);
        const duplicateUrls = groups.map(g => g.url);
        const allMemberIdOccurrences = groups.flatMap(g => g.memberIds);
        const memberIdsWithDuplicateUrls = [...new Set(allMemberIdOccurrences)];

        const memberIdCounts = new Map();
        for (const memberId of allMemberIdOccurrences) {
          memberIdCounts.set(memberId, (memberIdCounts.get(memberId) || 0) + 1);
        }
        const nonUniqueMemberIds = [...memberIdCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([memberId, count]) => ({ memberId, count }))
          .sort((a, b) => b.count - a.count);

        const report = {
          totalRowsProcessed: totalRows,
          totalDuplicateGroups: groups.length,
          totalIdsInDuplicateGroups: totalIdsInGroups,
          totalMemberIdOccurrencesInDuplicateGroups: allMemberIdOccurrences.length,
          uniqueMemberIdsWithDuplicateUrls: memberIdsWithDuplicateUrls.length,
          nonUniqueMemberIdsCount: nonUniqueMemberIds.length,
          duplicateUrls,
          memberIdsWithDuplicateUrls,
          nonUniqueMemberIds,
          groups,
        };

        if (outputJsonPath) {
          fs.writeFileSync(outputJsonPath, JSON.stringify(report, null, 2), 'utf8');
          console.log(`Report written to: ${outputJsonPath}`);
        } else {
          const csvDir = path.dirname(csvFilePath);
          const csvBasename = path.basename(csvFilePath, path.extname(csvFilePath));
          const defaultPath = path.join(csvDir, `${csvBasename}-duplicate-url-groups.json`);
          fs.writeFileSync(defaultPath, JSON.stringify(report, null, 2), 'utf8');
          console.log(`Report written to: ${defaultPath}`);
        }

        console.log('\n=== Non-unique URL groups (same URL → list of IDs, memberIds) ===');
        console.log(`Total rows processed: ${totalRows}`);
        console.log(`Number of duplicate URL groups: ${groups.length}`);
        console.log(`Total IDs in those groups: ${totalIdsInGroups}`);
        console.log(`Total memberId occurrences in those groups: ${allMemberIdOccurrences.length}`);
        console.log(`Unique memberIds in those groups: ${memberIdsWithDuplicateUrls.length}`);
        console.log(
          `MemberIds that appear more than once (non-unique): ${nonUniqueMemberIds.length}`
        );
        if (duplicateUrls.length > 0) {
          console.log('\nFirst 15 duplicate URLs:');
          duplicateUrls.slice(0, 15).forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
          });
        }

        resolve(report);
      });
  });
}

if (require.main === module) {
  const csvFilePath = process.argv[2];
  const outputJsonPath = process.argv[3];
  extractDuplicateUrlGroups(csvFilePath, outputJsonPath).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { extractDuplicateUrlGroups };
