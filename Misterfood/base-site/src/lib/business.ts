export type BusinessInfo = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  openingHours: string[];
  currency: string;
};

function readEnv(key: string, fallback: string) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : fallback;
}

export function getBusinessInfo(): BusinessInfo {
  const openingHoursRaw = readEnv('BUSINESS_OPENING_HOURS', 'Mon-Fri 11:30-22:00;Sat 12:00-23:00');
  const openingHours = openingHoursRaw.split(';').map(s => s.trim()).filter(Boolean);
  return {
    name: readEnv('BUSINESS_NAME', 'Misterfood'),
    address: readEnv('BUSINESS_ADDRESS', '12 Rue des Gourmets'),
    postalCode: readEnv('BUSINESS_POSTAL_CODE', '75000'),
    city: readEnv('BUSINESS_CITY', 'Paris'),
    country: readEnv('BUSINESS_COUNTRY', 'France'),
    phone: readEnv('BUSINESS_PHONE', '+33 1 23 45 67 89'),
    email: readEnv('BUSINESS_EMAIL', 'contact@example.com'),
    openingHours,
    currency: readEnv('BUSINESS_CURRENCY', 'EUR'),
  };
}
