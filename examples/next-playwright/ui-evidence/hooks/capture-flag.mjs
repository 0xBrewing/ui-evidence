export default async function captureFlag({ page }) {
  await page.addInitScript(() => {
    window.localStorage.setItem('ui-evidence-capture', 'true');
  });
}
