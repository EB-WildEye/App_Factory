/**
 * Every Hebrew user-facing string in the application, in one module.
 *
 * Nothing outside this file contains user-facing copy. A string that appears in
 * a component is a bug, per the code conventions in CLAUDE.md.
 */

export const documentStrings = {
  title: 'מפעל האפליקציות',
  description: 'הקמת אפליקציית צ׳אט שלמה מתוך טופס קונפיגורציה אחד',
} as const;

export const scaffoldStrings = {
  heading: 'מפעל האפליקציות',
  status: 'השלד הוקם. עוד אין ממשק.',
} as const;

/** Layout direction and document language. RTL Hebrew is the primary direction. */
export const documentLocale = {
  language: 'he',
  direction: 'rtl',
} as const;
