describe('Sentiment Analysis Upload Flow for Logged-in Users', () => {
  it('allows logged-in user to authenticate and perform a sentisheet request', () => {
    // Log in the user via the UI
    cy.visit('/login')
    cy.env(['user_email', 'user_password']).then(({ user_email, user_password }) => {
      cy.get('input[name="email"]').type(user_email)
      cy.get('input[name="password"]').type(user_password)
      cy.get('form').submit()

      cy.contains('Submit SentiSheet Request', { timeout: 10000 }).should('be.visible')

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
})