const hcaptchaStub = {
  render: (_el, params) => {
    setTimeout(() => params.callback && params.callback('test-token'), 50);
    return 'test-widget';
  },
  reset: () => {},
  execute: () => {},
  remove: () => {},
  getResponse: () => 'test-token',
  getRespKey: () => 'test-token',
  isReady: () => true,
};

describe('Sentiment Analysis Upload Flow', () => {
  beforeEach(() => {
    cy.intercept(/hcaptcha\.com.*api\.js/, (req) => {
      req.reply({
        body: `
          window.hcaptcha = ${JSON.stringify(hcaptchaStub).replace(/"([^"]+)":/g, '$1:')};
          window.hcaptcha.render = function(el, params) {
            setTimeout(function() { params.callback && params.callback('test-token'); }, 50);
            return 'test-widget';
          };
          window.hcaptcha.isReady = function() { return true; };
          window.hcaptcha.getResponse = function() { return 'test-token'; };
          window.hcaptcha.getRespKey = function() { return 'test-token'; };
          setTimeout(function() {
            window.hCaptchaOnLoad && window.hCaptchaOnLoad();
            window.hcaptchaOnLoad && window.hcaptchaOnLoad();
          }, 50);
        `,
        headers: { 'content-type': 'application/javascript' }
      });
    }).as('hcaptchaScript');
  });

  it('allows user to upload CSV and see results', () => {
    cy.visit('/')
    cy.contains('Try for free').click()

    // If the intercept fired, wait for it; otherwise fall back to window override
    cy.window().then(win => {
      win.hcaptcha = hcaptchaStub;
      if (typeof win.hCaptchaOnLoad === 'function') win.hCaptchaOnLoad();
    })

    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv')
    cy.contains('Selected for analysis', { timeout: 10000 }).should('be.visible')
    cy.contains('Basic Sentiment Classification').click()
    cy.contains('Google Gemini 2.5 Flash-Lite').click()
    cy.wait(300) // ensure captcha callback has fired
    cy.contains('Analyze Sentiment').click()
    cy.contains('We received your SentiSheet request and are currently processing your request right now.', { timeout: 20000 }).should('be.visible')
    cy.contains('Sentiment Analysis Results', { timeout: 20000 }).should('be.visible')
  })
})