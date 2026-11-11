const https = require('https');
const crypto = require('crypto');

const accessKey = process.env.AWS_ACCESS_KEY_ID || process.argv[2] || '';
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.argv[3] || '';
const region = 'us-east-1';

function hmac(key, string) {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest();
}

function hash(string) {
  return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, 'aws4_request');
}

function iamRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    const service = 'iam';
    const host = 'iam.amazonaws.com';

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const bodyParams = new URLSearchParams({
      Action: action,
      Version: '2010-05-08',
      ...params,
    });
    const requestBody = bodyParams.toString();

    const method = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = hash(requestBody);

    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/us-east-1/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

    const signingKey = getSignatureKey(secretKey, dateStamp, 'us-east-1', service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const req = https.request({
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host,
        'x-amz-date': amzDate,
        'Authorization': authorizationHeader,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`IAM Error (${res.statusCode}): ${data}`));
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  console.log("Intentando adjuntar política AmazonEC2FullAccess al usuario 'julio'...");
  try {
    const res = await iamRequest('AttachUserPolicy', {
      UserName: 'julio',
      PolicyArn: 'arn:aws:iam::aws:policy/AmazonEC2FullAccess'
    });
    console.log("✅ Política AmazonEC2FullAccess asignada con éxito!");
  } catch (e) {
    console.log("No se pudo adjuntar automáticamente:", e.message);
  }
}
main();

