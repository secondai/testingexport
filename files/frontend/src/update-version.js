
let versionFile = './src/version.json';

let fs = require('fs');
let semver = require('semver');

let version = fs.readFileSync(versionFile,'utf8');
version = JSON.parse(version).version;
version = semver.clean(version)
version = semver.inc(version, 'patch');

console.log('New Version:', version)

fs.writeFileSync(versionFile, JSON.stringify({version}));

console.log('Updated version.json');
