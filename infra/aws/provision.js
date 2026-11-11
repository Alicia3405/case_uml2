// ==============================================================================
// Script de aprovisionamiento automatizado en AWS EC2 para case_uml2
// Cuenta AWS: 886595575652
// ==============================================================================

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const accessKey = process.env.AWS_ACCESS_KEY_ID || process.argv[2] || '';
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.argv[3] || '';
const region = process.env.AWS_REGION || process.argv[4] || 'us-east-1';

console.log("==========================================================");
console.log(`🚀 Iniciando aprovisionamiento de nueva EC2 para case_uml2`);
console.log(`Cuenta AWS: 886595575652 | Región: ${region}`);
console.log("==========================================================");

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
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

function awsRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    const service = 'ec2';
    const host = `ec2.${region}.amazonaws.com`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const bodyParams = new URLSearchParams({
      Action: action,
      Version: '2016-11-15',
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
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

    const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
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
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`AWS Error (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  try {
    // 1. Probar credenciales y listar VPCs
    console.log("1. Autenticando con AWS y obteniendo VPC...");
    const vpcsXml = await awsRequest('DescribeVpcs');
    console.log("✅ Autenticación exitosa en AWS.");

    let vpcId = null;
    const defaultVpcMatch = vpcsXml.match(/<item>[\s\S]*?<vpcId>(vpc-[a-z0-9]+)<\/vpcId>[\s\S]*?<isDefault>true<\/isDefault>[\s\S]*?<\/item>/);
    if (defaultVpcMatch) {
      vpcId = defaultVpcMatch[1];
    } else {
      const anyVpc = vpcsXml.match(/<vpcId>(vpc-[a-z0-9]+)<\/vpcId>/);
      vpcId = anyVpc ? anyVpc[1] : null;
    }
    console.log(`VPC Seleccionada: ${vpcId}`);

    // 2. Verificar Key Pair existente
    console.log("2. Verificando Key Pairs en la cuenta...");
    const keyPairsXml = await awsRequest('DescribeKeyPairs');
    const keyPairNames = [...keyPairsXml.matchAll(/<keyName>([^<]+)<\/keyName>/g)].map(m => m[1]);
    console.log(`Key pairs disponibles: ${keyPairNames.join(', ')}`);

    let keyName = 'case-studio-key';
    if (!keyPairNames.includes(keyName)) {
      if (keyPairNames.length > 0) {
        keyName = keyPairNames[0];
        console.log(`⚠️ 'case-studio-key' no encontrado. Usando key pair existente: '${keyName}'`);
      } else {
        console.log("Creando nuevo key pair 'case_uml2-key'...");
        const createKeyRes = await awsRequest('CreateKeyPair', { KeyName: 'case_uml2-key' });
        const keyMaterialMatch = createKeyRes.match(/<keyMaterial>([\s\S]*?)<\/keyMaterial>/);
        if (keyMaterialMatch) {
          const keyMaterial = keyMaterialMatch[1].replace(/\\n/g, '\n');
          fs.writeFileSync('C:\\Users\\jkira\\Desktop\\case_uml2-key.pem', keyMaterial, 'utf8');
          console.log("✅ Clave privada guardada en C:\\Users\\jkira\\Desktop\\case_uml2-key.pem");
        }
        keyName = 'case_uml2-key';
      }
    } else {
      console.log(`✅ Key pair '${keyName}' confirmado en AWS.`);
    }

    // 3. Crear o verificar Security Group
    console.log("3. Verificando Grupo de Seguridad 'case_uml2-sg'...");
    let sgId = null;
    try {
      const descSg = await awsRequest('DescribeSecurityGroups', {
        'Filter.1.Name': 'group-name',
        'Filter.1.Value.1': 'case_uml2-sg'
      });
      const sgMatch = descSg.match(/<groupId>(sg-[a-z0-9]+)<\/groupId>/);
      if (sgMatch) sgId = sgMatch[1];
    } catch (e) {}

    if (!sgId) {
      console.log("Creando Security Group 'case_uml2-sg'...");
      const createParams = {
        GroupName: 'case_uml2-sg',
        GroupDescription: 'Security Group exclusivo e independiente para case_uml2'
      };
      if (vpcId) createParams.VpcId = vpcId;
      const createSg = await awsRequest('CreateSecurityGroup', createParams);
      const sgMatch = createSg.match(/<groupId>(sg-[a-z0-9]+)<\/groupId>/);
      sgId = sgMatch ? sgMatch[1] : null;

      console.log("Configurando reglas de firewall (puertos 22, 80, 443, 3000, 3001, 3002)...");
      const ports = [22, 80, 443, 3000, 3001, 3002];
      for (let i = 0; i < ports.length; i++) {
        await awsRequest('AuthorizeSecurityGroupIngress', {
          GroupId: sgId,
          [`IpPermissions.1.IpProtocol`]: 'tcp',
          [`IpPermissions.1.FromPort`]: ports[i].toString(),
          [`IpPermissions.1.ToPort`]: ports[i].toString(),
          [`IpPermissions.1.IpRanges.1.CidrIp`]: '0.0.0.0/0'
        }).catch(() => {});
      }
    }
    console.log(`✅ Security Group listo: ${sgId}`);

    // 4. Obtener AMI de Ubuntu oficial de Canonical (099720109477)
    console.log("4. Buscando AMI oficial de Canonical Ubuntu...");
    let imageId = 'ami-0c7217cdde317cfec';
    try {
      const descAmi = await awsRequest('DescribeImages', {
        'Filter.1.Name': 'owner-id',
        'Filter.1.Value.1': '099720109477',
        'Filter.2.Name': 'name',
        'Filter.2.Value.1': 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'
      });
      const items = descAmi.split('</item>').map(raw => {
        const id = raw.match(/<imageId>(ami-[a-z0-9]+)<\/imageId>/)?.[1];
        const name = raw.match(/<name>([^<]+)<\/name>/)?.[1];
        const date = raw.match(/<creationDate>([^<]+)<\/creationDate>/)?.[1];
        const isPublic = raw.match(/<isPublic>(true|false)<\/isPublic>/)?.[1];
        return { id, name, date, isPublic };
      }).filter(x => x.id && x.date && x.isPublic === 'true');
      items.sort((a, b) => b.date.localeCompare(a.date));
      if (items.length > 0) {
        console.log(`AMIs oficiales encontradas: ${items.length}, primera: ${items[0].id} (${items[0].name})`);
        imageId = items[0].id;
      }
    } catch (e) {
      console.log("Error buscando AMI:", e.message);
    }
    console.log(`✅ AMI Seleccionada: ${imageId}`);

    // 5. Preparar User Data
    const userDataPath = path.join(__dirname, 'user-data.sh');
    const userDataContent = fs.readFileSync(userDataPath, 'utf8');
    const userDataBase64 = Buffer.from(userDataContent).toString('base64');

    // 5. Consultar tipos de instancia Free Tier en la cuenta
    console.log("Consultando tipos de instancia aptos para Free Tier...");
    try {
      const ftRes = await awsRequest('DescribeInstanceTypes', {
        'Filter.1.Name': 'free-tier-eligible',
        'Filter.1.Value.1': 'true'
      });
      const ftTypes = [...ftRes.matchAll(/<instanceType>([^<]+)<\/instanceType>/g)].map(m => m[1]);
      console.log("Tipos Free Tier disponibles:", ftTypes);
    } catch (e) {
      console.log("Nota Free Tier:", e.message);
    }

    // 6. Lanzar la nueva instancia EC2
    console.log("5. Lanzando nueva máquina virtual EC2 exclusiva para case_uml2...");
    const runRes = await awsRequest('RunInstances', {
      ImageId: imageId,
      InstanceType: 't3.micro',
      KeyName: keyName,
      MinCount: '1',
      MaxCount: '1',
      'SecurityGroupId.1': sgId,
      UserData: userDataBase64,
      'TagSpecification.1.ResourceType': 'instance',
      'TagSpecification.1.Tag.1.Key': 'Name',
      'TagSpecification.1.Tag.1.Value': 'case_uml2-ec2-instance',
      'TagSpecification.1.Tag.2.Key': 'Project',
      'TagSpecification.1.Tag.2.Value': 'case_uml2',
      'TagSpecification.1.Tag.3.Key': 'Account',
      'TagSpecification.1.Tag.3.Value': '886595575652'
    });

    const instMatch = runRes.match(/<instanceId>(i-[a-z0-9]+)<\/instanceId>/);
    const instanceId = instMatch ? instMatch[1] : null;
    console.log(`✅ Instancia creada exitosamente con ID: ${instanceId}`);

    // 7. Esperar estado Running e IP Pública
    console.log("6. Esperando asignación de IP Pública...");
    let publicIp = null;
    for (let attempt = 1; attempt <= 25; attempt++) {
      await new Promise(r => setTimeout(r, 6000));
      const statusRes = await awsRequest('DescribeInstances', {
        'InstanceId.1': instanceId
      });
      const ipMatch = statusRes.match(/<ipAddress>([0-9\.]+)<\/ipAddress>/);
      const stateMatch = statusRes.match(/<instanceState>[\s\S]*?<name>([a-z-]+)<\/name>/);
      const state = stateMatch ? stateMatch[1] : 'pending';

      if (ipMatch) {
        publicIp = ipMatch[1];
        console.log(`\nIP detectada: ${publicIp} (Estado: ${state})`);
        if (state === 'running') break;
      } else {
        process.stdout.write(".");
      }
    }

    if (!publicIp) {
      console.error("\n⚠️ La instancia se creó pero aún no tiene IP asignada. Consulta la consola de AWS.");
      process.exit(1);
    }

    console.log("");
    console.log("==========================================================");
    console.log(`🎉 ¡Instancia EC2 lista para case_uml2!`);
    console.log(`ID Instancia: ${instanceId}`);
    console.log(`IP Pública: ${publicIp}`);
    console.log(`URL Web: http://${publicIp}`);
    console.log("==========================================================");

    // Guardar IP en archivo local para conveniencia
    fs.writeFileSync(path.join(__dirname, 'last-deployed-ip.txt'), publicIp, 'utf8');

    // 8. Iniciar despliegue
    console.log("7. Esperando 30 segundos a que inicialice SSH...");
    await new Promise(r => setTimeout(r, 30000));

    console.log("8. Ejecutando despliegue de case_uml2 en la nueva máquina...");
    const deployScript = path.join(__dirname, 'deploy-to-ec2.ps1');
    execSync(`powershell -ExecutionPolicy Bypass -File "${deployScript}" -HostIp "${publicIp}"`, {
      stdio: 'inherit'
    });

  } catch (err) {
    console.error("❌ Error durante el aprovisionamiento:", err.message);
    process.exit(1);
  }
}

main();
