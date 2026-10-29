/**
 * Utilitaires pour la manipulation des tableaux
 */

/**
 * Mélange un tableau (algorithme de Fisher-Yates)
 * @param array Tableau à mélanger
 * @returns Nouveau tableau mélangé
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
} 