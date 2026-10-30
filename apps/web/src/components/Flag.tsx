import { countryInfo } from '@/lib/countries';

/** The flag of a country as the circuits spell it (a small image, so it looks the same on every device); nothing for a country we do not know. */
export function Flag({ country }: { country: string }) {
  const { cc } = countryInfo(country);
  return cc ? <img src={`https://flagcdn.com/w40/${cc}.png`} srcSet={`https://flagcdn.com/w80/${cc}.png 2x`} width={20} height={15} alt="" loading="lazy" style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)', verticalAlign: 'middle' }} /> : null;
}
