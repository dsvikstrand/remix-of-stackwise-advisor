const requiredNodeMajor = 20;
const requiredNodeVersion = '20.20.0';
const currentNodeVersion = process.versions?.node || 'unknown';
const currentNodeMajor = Number.parseInt(currentNodeVersion.split('.')[0] || '', 10);

if (!Number.isFinite(currentNodeMajor) || currentNodeMajor < requiredNodeMajor) {
  console.error(
    `Node ${requiredNodeMajor}+ is required for backend startup. Detected ${currentNodeVersion}. Run "nvm use ${requiredNodeVersion}" before starting the server.`,
  );
  process.exit(1);
}
