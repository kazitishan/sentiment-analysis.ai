export const getHCaptchaConfig = () => {
  if (process.env.NODE_ENV !== 'production') {
    return {
      siteKey: '10000000-ffff-ffff-ffff-000000000001',
    }
  }
  return {
    siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY,
  }
}