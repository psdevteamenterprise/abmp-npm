const crypto = require('crypto');

const { auth } = require('@wix/essentials');
const { files } = require('@wix/media');
const aws4 = require('aws4');
const axios = require('axios');

const elevatedGenerateFileUploadUrl = auth.elevate(files.generateFileUploadUrl);

const { PAGES_PATHS } = require('../../public/consts');
const { isWixHostedImage } = require('../../public/Utils/sharedUtils');
const { findMemberByWixDataId, updateMember } = require('../members-data-methods');
const { getSecret, getSiteBaseUrl, encodeXml, formatDateOnly } = require('../utils');
async function getServerlessAuth() {
  const serverlessAuth = await getSecret('serverless_auth');
  return serverlessAuth;
}

function isValidImageUrl(url) {
  console.log('url', url);
  console.log('typeof url', typeof url);
  if (!url || typeof url !== 'string') return false;

  // Check for valid URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    console.log('parsedUrl', parsedUrl);
  } catch {
    return false;
  }
  console.log('parsedUrl', parsedUrl);
  console.log('parsedUrl.protocol', parsedUrl.protocol);
  // Only allow HTTP and HTTPS protocols (reject blob:, data:, file:, etc.)
  const validProtocols = ['http:', 'https:'];
  if (!validProtocols.includes(parsedUrl.protocol)) {
    return false;
  }

  // Extract file extension from URL (handle query parameters)
  const urlPath = url.split('?')[0].toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  console.log('urlPath', urlPath);
  // Check if URL ends with valid extension
  const hasValidExtension = validExtensions.some(ext => urlPath.endsWith(ext));
  console.log('hasValidExtension', hasValidExtension);
  // Reject obviously invalid extensions
  const invalidExtensions = [
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.ps',
    '.html',
    '.htm',
    '_jpg',
    '_png',
    '_gif',
  ];
  const hasInvalidExtension = invalidExtensions.some(ext => urlPath.includes(ext));
  console.log('hasInvalidExtension', hasInvalidExtension);
  return hasValidExtension && !hasInvalidExtension;
}

function isValidContentType(contentType) {
  if (!contentType) return false;

  const contentTypeLower = contentType.toLowerCase();

  // Valid image content types
  const validTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
  ];

  // Explicitly reject non-image content types
  const invalidTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/html',
    'text/htm',
    'application/octet-stream',
  ];

  if (invalidTypes.some(type => contentTypeLower.includes(type))) {
    return false;
  }

  return validTypes.includes(contentTypeLower);
}
async function updateMemberRichContent(memberId) {
  console.log('starting to call http function for member', memberId);

  const member = await findMemberByWixDataId(memberId);
  const htmlString = member.aboutYouHtml;
  const raw = JSON.stringify({
    content: htmlString,
  });

  const requestHeaders = {
    'Content-Type': 'application/json',
    Cookie: 'XSRF-TOKEN=1753949844|p--a7HsuVjR4',
    Authorization: 'Bearer ' + (await getServerlessAuth()),
  };

  try {
    const response = await axios.post(
      'https://www.wixapis.com/data-sync/v1/abmp-content-converter',
      raw,
      {
        headers: requestHeaders,
        validateStatus: () => true,
      }
    );
    if (response.status >= 200 && response.status < 300) {
      const data = response.data;
      const updatedMember = {
        ...member,
        aboutYourSelf: data.richContent.richContent,
        aboutYouText: data.plainText.plainText,
      };
      if (data.richContent.status != 'VALID' || data.plainText.status != 'VALID') {
        console.error(`updateMemberRichContent faield for member: ${memberId} `, {
          memberId,
          raw,
          data,
        });
      }
      console.log('updatedMember **********', updatedMember);
      await updateMember(updatedMember);
      console.log('rich content added successfully for member with id:  ', memberId);
    } else {
      console.error(`error in fetching data for member ID: ${memberId}, response: ${response}`);
    }
  } catch (error) {
    console.error('error in fetching data', error);
  }
}
async function updateMemberProfileImage(memberId) {
  try {
    const member = await findMemberByWixDataId(memberId);
    const trimmedProfileImage = member.profileImage?.trim();
    // Check if member has an external profile image URL
    if (!trimmedProfileImage || isWixHostedImage(trimmedProfileImage)) {
      console.log(`Member ${memberId} already has Wix-hosted image or no image`);
      return { success: true, message: 'No update needed' };
    }

    // Validate image URL format before attempting download
    if (!isValidImageUrl(trimmedProfileImage)) {
      console.log(`Member ${memberId} has invalid image URL format: ${trimmedProfileImage}`);
      return { success: true, message: 'Invalid image URL format - skipped' };
    }

    // Encode URL to handle spaces and special characters in the path
    const encodedImageUrl = encodeURI(trimmedProfileImage);

    const response = await axios.get(encodedImageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      timeout: 10000, // 10 second timeout
    });
    const buffer = Buffer.from(response.data);
    console.log('Downloaded image buffer size:', buffer.length);

    // Check minimum file size (1KB) to avoid empty/corrupted files
    if (buffer.length < 1024) {
      console.log(`Member ${memberId} has file too small: ${buffer.length} bytes`);
      return {
        success: true,
        message: `File too small (${buffer.length} bytes) - skipped`,
      };
    }

    const contentType = response.headers['content-type'];

    // Validate content type after download
    if (!isValidContentType(contentType)) {
      console.log(`Member ${memberId} has invalid content type: ${contentType}`);
      return {
        success: true,
        message: `Invalid content type: ${contentType} - skipped`,
      };
    }

    // Determine file extension from content type
    const extension = contentType.includes('png')
      ? 'png'
      : contentType.includes('gif')
        ? 'gif'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('bmp')
            ? 'bmp'
            : 'jpg';

    // Double-check: ensure we're not trying to upload non-image files
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    if (!allowedExtensions.includes(extension)) {
      console.log(`Member ${memberId} has invalid file extension: ${extension}`);
      return {
        success: true,
        message: `Invalid file extension: ${extension} - skipped`,
      };
    }

    const sanitizedFileName = `profile-${memberId}-${Date.now()}.${extension}`.replace(/\./g, '_');
    const uploadUrl = (
      await elevatedGenerateFileUploadUrl(contentType, {
        fileName: sanitizedFileName,
        filePath: 'member-profiles',
      })
    ).uploadUrl;
    const params = { filename: sanitizedFileName };
    const headers = {
      'Content-Type': contentType,
    };

    const uploadResponse = await axios.put(uploadUrl, buffer, {
      headers,
      params,
    });
    const fileUrl = uploadResponse.data.file.url;
    const updatedMember = {
      ...member,
      profileImage: fileUrl,
    };
    await updateMember(updatedMember);

    return {
      success: true,
      message: 'Profile image updated successfully',
      oldUrl: member.profileImage,
      newUrl: fileUrl,
    };
  } catch (error) {
    console.error(`Error updating profile image for member ${memberId}:`, error);

    // Handle specific HTTP errors
    if (error.response) {
      const status = error.response.status;
      if (status === 403) {
        return {
          success: true,
          message: `403 Forbidden - Access denied to image URL - skipped`,
        };
      } else if (status === 404) {
        return {
          success: true,
          message: `404 Not Found - Image URL not found - skipped`,
        };
      } else if (status === 406) {
        return {
          success: true,
          message: `406 Not Acceptable - Server rejected request headers - skipped`,
        };
      } else if (status >= 400 && status < 500) {
        return {
          success: true,
          message: `${status} Client Error - Invalid image URL - skipped`,
        };
      }
    }

    return {
      success: false,
      error: error.message || error,
    };
  }
}

async function getAWSTokens() {
  const [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY] = await Promise.all([
    getSecret('AWS_ACCESS_KEY_ID'),
    getSecret('AWS_SECRET_ACCESS_KEY'),
  ]);

  // const AWS_SESSION_TOKEN = await getSecret("AWS_SESSION_TOKEN")
  return {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
  };
}

async function generateSitemapXml(members) {
  const baseUrl = (await getSiteBaseUrl()).replace(/\/+$/, '');
  const profilePageUrl = `${baseUrl}/${PAGES_PATHS.PROFILE}`;
  const urls = members
    .map(m => {
      const loc = `${profilePageUrl}/${encodeURIComponent(m.url)}`;
      const lastmod =
        m && m._updatedDate
          ? `\n    <lastmod>${encodeXml(formatDateOnly(m._updatedDate))}</lastmod>`
          : '';
      return `  <url>\n    <loc>${encodeXml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
async function uploadMembersSitemap({ members, tokens, destinationFileName, siteAssociation }) {
  const toLowerCaseSiteAssociation = siteAssociation.toLowerCase().trim();
  const bucketHostname = (bucket, region) => {
    const r = region || process?.env?.AWS_REGION || process?.env?.AWS_DEFAULT_REGION || 'us-east-1';
    return `${bucket}.s3.${r}.amazonaws.com`;
  };
  if (!siteAssociation) {
    throw new Error('Site association is required to determine the AWS S3 bucket name');
  }
  const bucket = `${toLowerCaseSiteAssociation}-sitemap`; // e.g: 'abmp-sitemap' or 'ascp-sitemap'
  const region = 'us-east-1';
  const destination_file_name = destinationFileName;

  console.log('Sitemap generation started');
  const xml = await generateSitemapXml(members);
  console.log('Sitemap generation completed');
  const body = xml;
  console.log('Body length:', body.length);
  const sha256Hex = crypto.createHash('sha256').update(body).digest('hex');
  console.log('SHA256 hash calculated');
  const host = bucketHostname(bucket, region);
  const method = 'PUT';
  const pathName = `/${encodeURI(destination_file_name).replace(/%2F/g, '/')}`;
  console.log('Path name calculated');
  const headers = {
    'Content-Type': 'application/xml',
    'X-Amz-Content-Sha256': sha256Hex,
  };

  const creds = {
    accessKeyId: tokens.AWS_ACCESS_KEY_ID,
    secretAccessKey: tokens.AWS_SECRET_ACCESS_KEY,
    // sessionToken: tokens.AWS_SESSION_TOKEN,
  };

  const reqOpts = {
    host,
    path: pathName,
    service: 's3',
    region: region,
    method,
    headers,
    body,
  };
  aws4.sign(reqOpts, creds);
  console.log('Request options signed');

  const url = `https://${host}${pathName}`;
  console.log('url', url);
  const res = await axios.put(url, body, {
    headers: reqOpts.headers,
    transformResponse: [d => d],
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    const respText = res.data;
    console.log('Response body', respText);
    throw new Error(`S3 PUT failed ${res.status} ${res.statusText}: ${respText}`);
  }
}

async function stsPost(body, baseAccessKeyId, baseSecretAccessKey) {
  const host = 'sts.amazonaws.com';
  const method = 'POST';
  const path = '/';
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
  };
  const reqOpts = {
    host,
    path,
    service: 'sts',
    region: 'us-east-1',
    method,
    headers,
    body,
  };
  const parseXmlVal = (xml, tag) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1] : '';
  };
  aws4.sign(reqOpts, {
    accessKeyId: baseAccessKeyId,
    secretAccessKey: baseSecretAccessKey,
  });
  const res = await axios.post(`https://${host}${path}`, body, {
    headers: reqOpts.headers,
    transformResponse: [d => d],
    validateStatus: () => true,
  });
  const text = res.data;
  if (res.status < 200 || res.status >= 300) throw new Error(`STS ${res.status}: ${text}`);

  const accessKeyId = parseXmlVal(text, 'AccessKeyId');
  const secretAccessKey = parseXmlVal(text, 'SecretAccessKey');
  const sessionToken = parseXmlVal(text, 'SessionToken');
  const expiration = parseXmlVal(text, 'Expiration');
  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
    throw new Error('Failed parsing STS response');
  }
  return {
    accessKeyId,
    secretAccessKey,
    // sessionToken,
    expiresAt: new Date(expiration).toISOString(),
  };
}

// GetSessionToken (no role)
function getNewStsSessionToken(baseAccessKeyId, baseSecretAccessKey, durationSeconds = 3600) {
  const body = `Action=GetSessionToken&Version=2011-06-15&DurationSeconds=${durationSeconds}`;
  return stsPost(body, baseAccessKeyId, baseSecretAccessKey);
}

module.exports = {
  updateMemberRichContent,
  updateMemberProfileImage,
  getAWSTokens,
  uploadMembersSitemap,
  getNewStsSessionToken, //Dev only Method
};
