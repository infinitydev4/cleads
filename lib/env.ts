const getEnvVariable = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    console.warn(`La variable d'environnement ${key} n'est pas définie`);
    return '';
  }
  return value;
};

export const env = {
  AWS_REGION: getEnvVariable('AWS_REGION'),
  AWS_ACCESS_KEY_ID: getEnvVariable('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: getEnvVariable('AWS_SECRET_ACCESS_KEY'),
  AWS_BUCKET_NAME: getEnvVariable('AWS_BUCKET_NAME'),
}; 