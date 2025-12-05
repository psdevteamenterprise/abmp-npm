const fs = require('fs');
const path = require('path');

// eslint-disable-next-line import/no-unresolved
const csv = require('csv-parser');

/**
 * Finds duplicate URLs in a CSV file and generates a JSON report
 * Usage: node scripts/find-duplicate-urls.js <path-to-csv-file>
 */
function findDuplicateUrls(csvFilePath) {
  // Validate command-line argument
  if (!csvFilePath) {
    console.error('Error: CSV file path is required');
    console.error('Usage: node scripts/find-duplicate-urls.js <path-to-csv-file>');
    process.exit(1);
  }

  // Validate file exists and is readable
  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: File not found: ${csvFilePath}`);
    process.exit(1);
  }

  const urlMap = new Map(); // url -> [memberId1, memberId2, ...]
  let totalMembers = 0;
  let rowNumber = 0;
  let headersValidated = false;
  let headers = null;
  let urlColumnName = null;
  let memberIdColumnName = null;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('headers', receivedHeaders => {
        headers = receivedHeaders;
        // Validate required columns exist - normalize by removing quotes, trimming, and lowercasing
        const normalizedHeaders = headers.map(h => {
          let normalized = String(h).trim();
          // Remove all quotes (single and double) from the string
          normalized = normalized.replace(/["']/g, '');
          return normalized.toLowerCase().trim();
        });

        // Find the actual column names for url and memberId
        const urlIndex = normalizedHeaders.indexOf('url');
        const memberIdIndex = normalizedHeaders.indexOf('memberid');

        if (urlIndex === -1 || memberIdIndex === -1) {
          console.error('Error: CSV must contain "url" and "memberId" columns (case-insensitive)');
          console.error(`Found columns: ${headers.join(', ')}`);
          console.error(`Normalized columns: ${normalizedHeaders.join(', ')}`);
          process.exit(1);
        }

        // Store the actual column names (with original casing/quotes)
        urlColumnName = headers[urlIndex];
        memberIdColumnName = headers[memberIdIndex];
        headersValidated = true;
      })
      .on('data', row => {
        // Validate headers on first data row if headers event didn't fire
        if (!headersValidated) {
          headers = Object.keys(row);
          // Normalize by removing quotes, trimming, and lowercasing
          const normalizedHeaders = headers.map(h => {
            let normalized = String(h).trim();
            // Remove all quotes (single and double) from the string
            normalized = normalized.replace(/["']/g, '');
            return normalized.toLowerCase().trim();
          });

          const urlIndex = normalizedHeaders.indexOf('url');
          const memberIdIndex = normalizedHeaders.indexOf('memberid');

          if (urlIndex === -1 || memberIdIndex === -1) {
            console.error(
              'Error: CSV must contain "url" and "memberId" columns (case-insensitive)'
            );
            console.error(`Found columns: ${headers.join(', ')}`);
            console.error(`Normalized columns: ${normalizedHeaders.join(', ')}`);
            process.exit(1);
          }

          // Store the actual column names
          urlColumnName = headers[urlIndex];
          memberIdColumnName = headers[memberIdIndex];
          headersValidated = true;
        }

        rowNumber++;
        totalMembers++;

        // Get URL and memberId using the actual column names from headers
        const url = row[urlColumnName];
        const memberId = row[memberIdColumnName];

        // Skip rows with missing URL or memberId
        if (!url || !memberId) {
          console.warn(
            `Warning: Row ${rowNumber} skipped - missing url or memberId (url: ${url}, memberId: ${memberId})`
          );
          return;
        }

        const trimmedUrl = url.trim();
        const trimmedMemberId = memberId.trim();

        // Track URL occurrences
        if (!urlMap.has(trimmedUrl)) {
          urlMap.set(trimmedUrl, []);
        }
        urlMap.get(trimmedUrl).push(trimmedMemberId);
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

        // Find duplicates (URLs with count > 1)
        const duplicateUrls = [];
        let totalDuplicates = 0;

        for (const [url, memberIds] of urlMap.entries()) {
          if (memberIds.length > 1) {
            duplicateUrls.push({
              url: url,
              count: memberIds.length,
              memberIds: memberIds,
            });
            totalDuplicates += memberIds.length;
          }
        }

        // Sort by count (descending) then by URL (ascending)
        duplicateUrls.sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return a.url.localeCompare(b.url);
        });

        const totalUniqueUrls = urlMap.size;
        const uniqueDuplicateUrls = duplicateUrls.length;

        // Create a simple list of duplicated URLs (just the URL strings)
        const duplicatedUrlsList = duplicateUrls.map(item => item.url);

        // Generate report
        const report = {
          totalMembers: totalMembers,
          totalUniqueUrls: totalUniqueUrls,
          duplicateUrls: duplicateUrls,
          duplicatedUrlsList: duplicatedUrlsList,
          summary: {
            totalDuplicates: totalDuplicates,
            uniqueDuplicateUrls: uniqueDuplicateUrls,
          },
        };

        // Generate output filename
        const csvDir = path.dirname(csvFilePath);
        const csvBasename = path.basename(csvFilePath, path.extname(csvFilePath));
        const outputPath = path.join(csvDir, `${csvBasename}-duplicate-urls-report.json`);

        // Write JSON report
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

        console.log('\n=== Duplicate URL Report ===');
        console.log(`Total members processed: ${totalMembers}`);
        console.log(`Total unique URLs: ${totalUniqueUrls}`);
        console.log(`Unique URLs with duplicates: ${uniqueDuplicateUrls}`);
        console.log(`Total duplicate entries: ${totalDuplicates}`);
        console.log(`\nReport saved to: ${outputPath}`);
        console.log(`\nTop 10 most duplicated URLs:`);
        duplicateUrls.slice(0, 10).forEach((item, index) => {
          console.log(
            `  ${index + 1}. "${item.url}" - appears ${item.count} times (memberIds: ${item.memberIds.join(', ')})`
          );
        });

        resolve(report);
      });
  });
}

// Run if executed directly
if (require.main === module) {
  const csvFilePath = process.argv[2];
  findDuplicateUrls(csvFilePath).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { findDuplicateUrls };
