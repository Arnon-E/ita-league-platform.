/** Player profile photos live on Loglig (public files; shown here with the federation's approval). */
export const photoUrl = (file: string | null | undefined) => (file && /^[\w.\-]+$/.test(file) ? `https://loglig.com/assets/players/${file}` : null);
