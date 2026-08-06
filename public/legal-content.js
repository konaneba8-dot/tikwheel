const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderSection({ title, paragraphs }) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    </section>
  `;
}

const termsSections = [
  {
    title: 'Important notice',
    paragraphs: [
      'PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY BEFORE USING TIKWHEEL.',
      'By registering an Account, accessing the Platform, submitting an Entry, or otherwise using any TikWheel service, you confirm that you have read and understood these General Terms, agree to be legally bound by them, and are legally permitted to use the Platform under applicable law.',
      'IF YOU DO NOT AGREE TO THESE GENERAL TERMS, YOU MUST NOT USE THE PLATFORM.',
    ],
  },
  {
    title: '1. Regulatory status and legal compliance',
    paragraphs: [
      'TikWheel operates only to the extent permitted by applicable law and any required regulatory authorization, approval, or license.',
      'TikWheel may restrict, suspend, or discontinue services in any jurisdiction or for any category of person where required by law, regulatory direction, or compliance requirements.',
    ],
  },
  {
    title: '2. Definitions and interpretation',
    paragraphs: [
      'These General Terms use platform-specific definitions for Account, Applicable Law, Entry, Entry Fee, Game, Game Rules, Player, Prize, Selection System, TikWheel System, and Winner.',
      'The Game Rules displayed at the time of participation form part of these General Terms.',
    ],
  },
  {
    title: '3. Player eligibility',
    paragraphs: [
      'You may use TikWheel only if you are legally eligible to participate under Applicable Law.',
      'TikWheel may require proof of eligibility at any time and may refuse participation where eligibility cannot be satisfactorily verified.',
    ],
  },
  {
    title: '4. Account registration',
    paragraphs: [
      'Certain Platform services require registration of an Account.',
      'You must provide complete, accurate, and current information and must not use false identity details, impersonate another person, or create multiple Accounts to obtain an unfair advantage.',
    ],
  },
  {
    title: '5. Account security',
    paragraphs: [
      'You are responsible for keeping your login credentials confidential.',
      'You must immediately notify TikWheel if you suspect unauthorized access to your Account.',
    ],
  },
  {
    title: '6. Game structure and Game Rules',
    paragraphs: [
      'Each Game may have specific Game Rules covering the Entry Fee, number of available Entries, opening and closing conditions, Prize, selection method, eligibility requirements, and game-specific restrictions.',
      'You are responsible for reviewing the applicable Game Rules before submitting an Entry.',
    ],
  },
  {
    title: '7. Entries',
    paragraphs: [
      'An Entry is valid only when it has been successfully processed and recorded by the TikWheel System.',
      'A payment attempt, incomplete transaction, or technical request does not automatically create a valid Entry.',
    ],
  },
  {
    title: '8. Fees and payment processing',
    paragraphs: [
      'The applicable Entry Fee is displayed before participation is confirmed.',
      'TikWheel may delay, reject, reverse, or investigate a transaction where reasonably necessary for fraud prevention, security, technical, or compliance reasons.',
    ],
  },
  {
    title: '9. Game commencement and closure',
    paragraphs: [
      'A Game commences and closes in accordance with the applicable Game Rules.',
      'TikWheel may pause, suspend, or cancel a Game where a material technical, security, legal, or operational issue occurs.',
    ],
  },
  {
    title: '10. Winner selection and randomness',
    paragraphs: [
      'The Winner is selected through the approved TikWheel Selection System in accordance with the applicable Game Rules.',
      'No player is guaranteed to win a Game.',
    ],
  },
  {
    title: '11. Game integrity',
    paragraphs: [
      'TikWheel may use technical, operational, and security controls to detect suspicious activity.',
      'Where a Game is materially affected by fraud, manipulation, unauthorized access, or a technical incident, TikWheel may take reasonable corrective action.',
    ],
  },
  {
    title: '12. Winner verification',
    paragraphs: [
      'A selected Winner is subject to verification.',
      'TikWheel may require information or documentation reasonably necessary to verify identity, account ownership, eligibility, payment information, or compliance with Applicable Law.',
    ],
  },
  {
    title: '13. Prizes',
    paragraphs: [
      'Prize information is displayed in the applicable Game Rules or official Game information.',
      'TikWheel may withhold a Prize where release would violate Applicable Law or a valid regulatory requirement.',
    ],
  },
  {
    title: '14. Prohibited activities',
    paragraphs: [
      'Account sharing, multiple-Account abuse, collusion, automated participation, bot use, manipulation of the Selection System, payment fraud, identity fraud, and any conduct that violates Applicable Law are strictly prohibited.',
    ],
  },
  {
    title: '15. Fraud prevention and investigations',
    paragraphs: [
      'TikWheel may conduct internal reviews and investigations where it reasonably suspects fraud, abuse, manipulation, or other prohibited conduct.',
      'TikWheel may preserve relevant records and information in accordance with Applicable Law and may cooperate with competent authorities where required or permitted by law.',
    ],
  },
  {
    title: '16. Live streaming and third-party platforms',
    paragraphs: [
      'TikWheel may display or promote Games through third-party platforms, including social media and live-streaming services.',
      'A third-party platform does not determine the official TikWheel Game result unless expressly stated by TikWheel.',
    ],
  },
  {
    title: '17. Responsible participation',
    paragraphs: [
      'TikWheel encourages responsible participation and you should participate only within your financial means.',
      'You must not participate under pressure, coercion, or unlawful influence.',
    ],
  },
  {
    title: '18. System availability and technical events',
    paragraphs: [
      'TikWheel does not guarantee that the Platform will be continuously available.',
      'The Platform may be affected by maintenance, internet failures, hosting failures, payment-provider interruptions, cyber incidents, software errors, or events beyond TikWheel\'s reasonable control.',
    ],
  },
  {
    title: '19. Intellectual property',
    paragraphs: [
      'All TikWheel intellectual property, including trademarks, logos, software, designs, interfaces, content, and systems, is owned by or licensed to TikWheel.',
      'The Player must not copy, modify, distribute, reverse engineer, exploit, or commercially use TikWheel intellectual property without prior written authorization.',
    ],
  },
  {
    title: '20. Privacy and data processing',
    paragraphs: [
      'TikWheel may collect and process personal information necessary to operate the Platform and fulfill its legal and operational obligations.',
      'Personal information may be used for account management, transaction processing, identity verification, fraud prevention, security, customer support, and legal or regulatory compliance.',
    ],
  },
  {
    title: '21. Suspension and account closure',
    paragraphs: [
      'TikWheel may suspend or restrict an Account where it reasonably believes that these General Terms have been breached, fraud or abuse has occurred, the Account presents a security risk, the Player is legally ineligible, or action is required for compliance purposes.',
      'Suspension or closure does not release a Player from obligations that arose before suspension or closure.',
    ],
  },
  {
    title: '22. Disclaimer of warranties',
    paragraphs: [
      'To the maximum extent permitted by Applicable Law, the Platform is provided on an as-available and as-is basis.',
      'TikWheel does not guarantee that the Platform will always be available, uninterrupted, or free from errors, or that any Player will win a Game.',
    ],
  },
  {
    title: '23. Limitation of liability',
    paragraphs: [
      'To the maximum extent permitted by Applicable Law, TikWheel shall not be liable for indirect, incidental, special, or consequential losses arising from the use of the Platform.',
      'Nothing in these General Terms excludes or limits liability that cannot lawfully be excluded or limited.',
    ],
  },
  {
    title: '24. Player indemnity',
    paragraphs: [
      'To the extent permitted by Applicable Law, you agree to indemnify TikWheel, its officers, employees, contractors, and service providers against claims, losses, liabilities, costs, and expenses arising from your breach, unlawful use, fraud or misconduct, or violation of another person\'s rights.',
    ],
  },
  {
    title: '25. Customer complaints',
    paragraphs: [
      'Players may submit complaints through the official TikWheel support channels.',
      'TikWheel may request additional information and maintain records of complaints and investigations in accordance with its legal and operational requirements.',
    ],
  },
  {
    title: '26. Changes to these terms',
    paragraphs: [
      'TikWheel may amend these General Terms from time to time and the updated version shall be published on the Platform.',
      'Continued use of the Platform after the effective date constitutes acceptance of the updated Terms, to the extent permitted by Applicable Law.',
    ],
  },
  {
    title: '27. Governing law and jurisdiction',
    paragraphs: [
      'These General Terms shall be interpreted in accordance with Applicable Law.',
      'Disputes shall be subject to the jurisdiction of a competent authority or court with lawful jurisdiction.',
    ],
  },
  {
    title: '28. Severability',
    paragraphs: [
      'If any provision of these General Terms is held to be invalid, unlawful, or unenforceable, that provision shall be limited or removed to the minimum extent necessary.',
      'The remaining provisions shall continue in full force and effect.',
    ],
  },
  {
    title: '29. Entire agreement',
    paragraphs: [
      'These General Terms, the applicable Game Rules, the Privacy Policy, and any other policies expressly incorporated by reference constitute the agreement between you and TikWheel regarding your use of the Platform.',
    ],
  },
  {
    title: '30. Contact information',
    paragraphs: [
      'TikWheel Operator: [Legal Company Name]. Website: [Official Website]. Email: [Official Email]. Telephone: [Official Telephone]. Registered Address: [Official Address].',
    ],
  },
  {
    title: 'Player acceptance',
    paragraphs: [
      'BY REGISTERING, ACCESSING, OR USING TIKWHEEL, YOU CONFIRM THAT YOU HAVE READ, UNDERSTOOD, AND AGREED TO THESE GENERAL TERMS AND CONDITIONS.',
      'TIKWHEEL - FAIR PLAY. SECURE SYSTEMS. OFFICIAL RESULTS.',
    ],
  },
];

const gameRulesSections = [
  {
    title: '1. Purpose of these game rules',
    paragraphs: [
      'These Official Game Rules govern the operation of a TikWheel Game using the 100 Players - 100 Numbers format.',
      'These Game Rules must be read together with the TikWheel General Terms and Conditions, Privacy Policy, and any applicable legal or regulatory requirements.',
    ],
  },
  {
    title: '2. Game format',
    paragraphs: [
      'Each TikWheel Game contains a maximum of 100 available Game Numbers, numbered 1 through 100.',
      'One valid Entry equals one Game Number, and the system does not permit two valid Entries to hold the same Game Number within the same Game.',
    ],
  },
  {
    title: '3. Game entry',
    paragraphs: [
      'A Player may participate by selecting an available Game Number through the TikWheel Platform.',
      'A Game Number becomes a valid Entry only after the TikWheel System successfully confirms the applicable transaction and records the Entry.',
    ],
  },
  {
    title: '4. Entry limit',
    paragraphs: [
      'Unless expressly stated otherwise in the applicable Game information, the standard limit is one Game Number per Player for each Game.',
      'TikWheel may apply additional Entry limits, restrictions, or eligibility conditions where permitted or required.',
    ],
  },
  {
    title: '5. Game status',
    paragraphs: [
      'The Platform may display OPEN, FULL, CLOSED, SUSPENDED, CANCELLED, or COMPLETED game statuses.',
      'The visual status reflects the operational state of the Game, including whether it is still accepting valid Entries or has already completed selection.',
    ],
  },
  {
    title: '6. Game completion',
    paragraphs: [
      'A Game becomes FULL when all 100 Game Numbers have been assigned to valid Entries.',
      'TikWheel may close, delay, suspend, or cancel a Game where a technical, security, legal, or operational issue may affect Game integrity.',
    ],
  },
  {
    title: '7. Number assignment',
    paragraphs: [
      'Each valid Entry is associated with one unique Game Number and the system record is the official record of Game Number assignment.',
      'A Player must not attempt to manipulate, duplicate, alter, or interfere with Game Number assignment.',
    ],
  },
  {
    title: '8. Official selection process',
    paragraphs: [
      'After the Game is eligible for selection, the TikWheel Selection System conducts the official selection process.',
      'The Selection System selects one Game Number from the valid Game Numbers recorded for the Game and does not allow manual control during the process.',
    ],
  },
  {
    title: '9. Random selection',
    paragraphs: [
      'The TikWheel Selection System is designed to select a Game Number randomly from the eligible valid Game Numbers.',
      'No Player is guaranteed to win and no person may manually choose the winning Game Number.',
    ],
  },
  {
    title: '10. Live display and game presentation',
    paragraphs: [
      'TikWheel may display the Game and Selection System through a live broadcast, Platform interface, or other approved presentation method.',
      'The visual wheel, roller, animation, countdown, or other display is a presentation interface for the official selection process and does not replace the official system record.',
    ],
  },
  {
    title: '11. Official game result',
    paragraphs: [
      'The official Game result is the Game Number selected by the TikWheel Selection System.',
      'The Player associated with that valid Game Number is the Winner, subject to Winner verification.',
    ],
  },
  {
    title: '12. Winner verification',
    paragraphs: [
      'The selected Winner is a Provisional Winner until the required verification process is completed.',
      'TikWheel may verify identity, account ownership, entry validity, eligibility, and compliance with the TikWheel General Terms and Conditions before releasing a Prize.',
    ],
  },
  {
    title: '13. Invalid entries',
    paragraphs: [
      'An Entry may be declared invalid where it was not successfully recorded, was created through fraud, was connected to an unauthorized transaction, resulted from Account manipulation, was obtained through multiple-Account abuse, was affected by unauthorized system interference, or violates the General Terms, these Game Rules, or Applicable Law.',
    ],
  },
  {
    title: '14. Full game example',
    paragraphs: [
      'For a standard 100 Players - 100 Numbers Game, Game Numbers are available from 1 to 100, each number represents one valid Entry, and the Selection System selects one eligible number when the Game is ready.',
      'Example: Selected Game Number 73 means the Player holding Game Number 73 is recorded as the Provisional Winner, subject to verification.',
    ],
  },
  {
    title: '15. Game suspension',
    paragraphs: [
      'TikWheel may suspend a Game where a material technical problem occurs, unauthorized access is suspected, Game integrity may be affected, or a payment or system issue requires investigation.',
      'During suspension, TikWheel may prevent additional Entries or selection activity.',
    ],
  },
  {
    title: '16. Game cancellation',
    paragraphs: [
      'TikWheel may cancel a Game where continuing the Game is not reasonably possible or may compromise fairness, security, or compliance.',
      'Where a Game is cancelled, TikWheel may retain relevant system records for audit, security, dispute, or legal purposes.',
    ],
  },
  {
    title: '17. Prohibited game manipulation',
    paragraphs: [
      'A Player must not attempt to influence the selected Game Number, interfere with the Selection System, access restricted Platform systems, use bots or automated tools, exploit a software vulnerability, create multiple Accounts to obtain an unfair advantage, collude with another person, or otherwise attempt to manipulate the Game.',
    ],
  },
  {
    title: '18. Game records and audit trail',
    paragraphs: [
      'TikWheel may maintain electronic records relating to each Game, including Game identification information, Entry records, Game Number assignments, transaction records, selection records, and technical or security records.',
      'Records may be used for operational control, dispute review, fraud prevention, security, and legal or regulatory purposes.',
    ],
  },
  {
    title: '19. Disputes relating to a Game',
    paragraphs: [
      'A Player wishing to raise a Game-related complaint should contact TikWheel through the official support channel and include the Game identification information and sufficient details to allow investigation.',
      'Game disputes are handled in accordance with the TikWheel General Terms and Conditions and Applicable Law.',
    ],
  },
  {
    title: '20. Final game rule',
    paragraphs: [
      'ONE GAME. 100 NUMBERS. 100 VALID ENTRY POSITIONS. ONE OFFICIAL SYSTEM SELECTION.',
      'By participating in a TikWheel Game, the Player confirms that they have read, understood, and agreed to these Official Game Rules.',
    ],
  },
];

export function renderTermsContent() {
  return `
    <section class="card prose">
      ${termsSections.map(renderSection).join('')}
    </section>
  `;
}

export function renderGameRulesContent() {
  return `
    <section class="card prose">
      ${gameRulesSections.map(renderSection).join('')}
    </section>
  `;
}
