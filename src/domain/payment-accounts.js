import crypto from 'node:crypto';

export const PAYMENT_ACCOUNT_TYPES = Object.freeze({
  BANK: 'BANK',
  WALLET: 'WALLET',
});

export function createPaymentAccount(input, createdBy) {
  const type = String(input.type || '').toUpperCase();
  if (!Object.values(PAYMENT_ACCOUNT_TYPES).includes(type)) {
    throw new Error('Invalid payment account type. Must be BANK or WALLET');
  }

  if (!input.accountName || !input.accountNumber) {
    throw new Error('Account name and account number are required');
  }

  return {
    id: `pay_${crypto.randomUUID()}`,
    type,
    bankName: String(input.bankName || '').trim(),
    accountName: String(input.accountName).trim(),
    accountNumber: String(input.accountNumber).trim(),
    active: input.active !== false,
    displayOrder: Number(input.displayOrder) || 0,
    createdBy: createdBy || 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function updatePaymentAccount(account, input, updatedBy) {
  if (input.type !== undefined) {
    const type = String(input.type).toUpperCase();
    if (!Object.values(PAYMENT_ACCOUNT_TYPES).includes(type)) {
      throw new Error('Invalid payment account type');
    }
    account.type = type;
  }

  if (input.bankName !== undefined) {
    account.bankName = String(input.bankName).trim();
  }

  if (input.accountName !== undefined) {
    account.accountName = String(input.accountName).trim();
  }

  if (input.accountNumber !== undefined) {
    account.accountNumber = String(input.accountNumber).trim();
  }

  if (input.active !== undefined) {
    account.active = Boolean(input.active);
  }

  if (input.displayOrder !== undefined) {
    account.displayOrder = Number(input.displayOrder);
  }

  account.updatedBy = updatedBy || 'system';
  account.updatedAt = new Date().toISOString();

  return account;
}

export function activatePaymentAccount(account, activatedBy) {
  account.active = true;
  account.updatedBy = activatedBy || 'system';
  account.updatedAt = new Date().toISOString();
  return account;
}

export function deactivatePaymentAccount(account, deactivatedBy) {
  account.active = false;
  account.updatedBy = deactivatedBy || 'system';
  account.updatedAt = new Date().toISOString();
  return account;
}

export function getActivePaymentAccounts(accounts, type = null) {
  const active = accounts.filter((acc) => acc.active === true);
  if (type) {
    return active.filter((acc) => acc.type === type.toUpperCase());
  }
  return active.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getPaymentAccountsByType(accounts, type) {
  return accounts.filter((acc) => acc.type === type.toUpperCase());
}
