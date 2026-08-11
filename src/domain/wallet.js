import crypto from 'node:crypto';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './statuses.js';

const MIN_WITHDRAWAL_AMOUNT = 500;

export function createWallet(userId) {
  return {
    id: `wlt_${crypto.randomUUID()}`,
    userId,
    balance: 0,
    currency: 'ETB',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createDepositTransaction(userId, amount, paymentMethod, paymentDetails) {
  const amountNum = Number(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error('Deposit amount must be greater than 0');
  }

  return {
    id: `txn_${crypto.randomUUID()}`,
    userId,
    type: TRANSACTION_TYPES.DEPOSIT,
    amount: amountNum,
    status: TRANSACTION_STATUSES.PENDING,
    paymentMethod: String(paymentMethod || 'unknown'),
    paymentDetails: paymentDetails || {},
    referralNumber: paymentDetails?.referralNumber || null,
    idDocumentUrl: paymentDetails?.idDocumentUrl || null,
    receiptUrl: paymentDetails?.receiptUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createWithdrawalTransaction(userId, amount, paymentDetails) {
  const amountNum = Number(amount);
  if (Number.isNaN(amountNum) || amountNum < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error(`Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} ETB`);
  }

  if (!paymentDetails || !paymentDetails.accountNumber) {
    throw new Error('Payment details are required for withdrawal');
  }

  return {
    id: `txn_${crypto.randomUUID()}`,
    userId,
    type: TRANSACTION_TYPES.WITHDRAW,
    amount: amountNum,
    status: TRANSACTION_STATUSES.PENDING,
    paymentMethod: paymentDetails.paymentMethod || 'bank_transfer',
    paymentDetails: {
      accountName: paymentDetails.accountName || '',
      accountNumber: paymentDetails.accountNumber || '',
      bankName: paymentDetails.bankName || '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function completeDepositTransaction(transaction, wallet) {
  if (transaction.type !== TRANSACTION_TYPES.DEPOSIT) {
    throw new Error('Transaction is not a deposit');
  }

  if (transaction.status === TRANSACTION_STATUSES.COMPLETED) {
    throw new Error('Transaction already completed');
  }

  transaction.status = TRANSACTION_STATUSES.COMPLETED;
  transaction.updatedAt = new Date().toISOString();

  wallet.balance += transaction.amount;
  wallet.updatedAt = new Date().toISOString();

  return { transaction, wallet };
}

export function approveWithdrawalTransaction(transaction, wallet) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status !== TRANSACTION_STATUSES.PENDING) {
    throw new Error('Only pending withdrawals can be approved');
  }

  if (wallet.balance < transaction.amount) {
    throw new Error('Insufficient wallet balance');
  }

  transaction.status = TRANSACTION_STATUSES.APPROVED;
  transaction.updatedAt = new Date().toISOString();

  return { transaction, wallet };
}

export function markWithdrawalReadyForPayment(transaction) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status !== TRANSACTION_STATUSES.APPROVED) {
    throw new Error('Only approved withdrawals can be marked ready for payment');
  }

  transaction.status = TRANSACTION_STATUSES.READY_FOR_PAYMENT;
  transaction.updatedAt = new Date().toISOString();

  return transaction;
}

export function markWithdrawalProcessing(transaction) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status !== TRANSACTION_STATUSES.READY_FOR_PAYMENT) {
    throw new Error('Only withdrawals ready for payment can be marked as processing');
  }

  transaction.status = TRANSACTION_STATUSES.PROCESSING;
  transaction.updatedAt = new Date().toISOString();

  return transaction;
}

export function markWithdrawalPaid(transaction, transferProof) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status !== TRANSACTION_STATUSES.PROCESSING) {
    throw new Error('Only processing withdrawals can be marked as paid');
  }

  // Double payment prevention
  if (transaction.status === TRANSACTION_STATUSES.PAID || transaction.status === TRANSACTION_STATUSES.COMPLETED) {
    throw new Error('Withdrawal has already been paid. Cannot pay again.');
  }

  transaction.status = TRANSACTION_STATUSES.PAID;
  transaction.transferProof = transferProof || {};
  transaction.paidAt = new Date().toISOString();
  transaction.updatedAt = new Date().toISOString();

  return transaction;
}

export function completeWithdrawalTransaction(transaction, wallet) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status !== TRANSACTION_STATUSES.PAID) {
    throw new Error('Only paid withdrawals can be completed');
  }

  transaction.status = TRANSACTION_STATUSES.COMPLETED;
  transaction.updatedAt = new Date().toISOString();

  wallet.balance -= transaction.amount;
  wallet.updatedAt = new Date().toISOString();

  return { transaction, wallet };
}

export function rejectWithdrawalTransaction(transaction, reason) {
  if (transaction.type !== TRANSACTION_TYPES.WITHDRAW) {
    throw new Error('Transaction is not a withdrawal');
  }

  if (transaction.status === TRANSACTION_STATUSES.COMPLETED) {
    throw new Error('Cannot reject a completed transaction');
  }

  transaction.status = TRANSACTION_STATUSES.FAILED;
  transaction.reason = String(reason || 'Withdrawal rejected by admin');
  transaction.updatedAt = new Date().toISOString();

  return transaction;
}

export function failDepositTransaction(transaction, reason) {
  if (transaction.type !== TRANSACTION_TYPES.DEPOSIT) {
    throw new Error('Transaction is not a deposit');
  }

  if (transaction.status === TRANSACTION_STATUSES.COMPLETED) {
    throw new Error('Cannot fail a completed transaction');
  }

  transaction.status = TRANSACTION_STATUSES.FAILED;
  transaction.reason = String(reason || 'Deposit failed');
  transaction.updatedAt = new Date().toISOString();

  return transaction;
}

export function createPrizeTransaction(userId, amount, roundId, position) {
  const amountNum = Number(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error('Prize amount must be greater than 0');
  }

  return {
    id: `txn_${crypto.randomUUID()}`,
    userId,
    type: 'PRIZE',
    amount: amountNum,
    status: TRANSACTION_STATUSES.COMPLETED,
    roundId,
    position,
    description: `Prize for winning position ${position} in round`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function creditPrizeToWallet(transaction, wallet) {
  if (transaction.type !== 'PRIZE') {
    throw new Error('Transaction is not a prize');
  }

  if (transaction.status === TRANSACTION_STATUSES.COMPLETED) {
    wallet.balance += transaction.amount;
    wallet.updatedAt = new Date().toISOString();
  }

  return { transaction, wallet };
}

export function getUserWallet(state, userId) {
  if (!Array.isArray(state.wallets)) {
    state.wallets = [];
  }

  let wallet = state.wallets.find((w) => w.userId === userId);
  if (!wallet) {
    wallet = createWallet(userId);
    state.wallets.push(wallet);
  }

  return wallet;
}

export function getUserTransactions(state, userId) {
  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }

  return state.transactions
    .filter((txn) => txn.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getAllPendingWithdrawals(state) {
  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }

  return state.transactions
    .filter((txn) => txn.type === TRANSACTION_TYPES.WITHDRAW && txn.status === TRANSACTION_STATUSES.PENDING)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function validateWithdrawalRequest(amount, walletBalance) {
  const amountNum = Number(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error('Withdrawal amount must be greater than 0');
  }

  if (amountNum < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error(`Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} ETB`);
  }

  if (amountNum > walletBalance) {
    throw new Error('Withdrawal amount cannot exceed available balance');
  }

  return true;
}
