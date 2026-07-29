export type ProductStockStatusKind = 'has_stock' | 'known_zero' | 'first_time'

export type InitialStockQuestion =
  | { kind: 'none'; totalStock: number; unit: string }
  | { kind: 'ask_previous_remainder'; purchaseAmount: number; unit: string }
  | { kind: 'ask_remainder_amount'; purchaseAmount: number; unit: string }

export interface InitialStockInput {
  stockStatus: ProductStockStatusKind
  existingStock?: number | null
  purchaseAmount: number
  unit: string
}

/** @deprecated Verwende stockStatus statt productAlreadyInStock. */
export interface LegacyInitialStockInput {
  productAlreadyInStock: boolean
  existingStock?: number | null
  purchaseAmount: number
  unit: string
}

export interface InitialStockAnswerInput {
  hadPreviousRemainder?: boolean
  previousRemainderAmount?: number | null
}

export interface InitialStockResult {
  totalStock: number
  unit: string
  askedAboutPreviousRemainder: boolean
  addedToExisting: boolean
}

/**
 * Erstmalige Bestandserfassung — getrennt von der Produkterkennung (DL-010 / CM-013).
 */
export function planInitialStockQuestion(input: InitialStockInput): InitialStockQuestion {
  if (input.purchaseAmount <= 0 || !input.unit.trim()) {
    throw new Error('Kaufmenge und Einheit sind erforderlich.')
  }

  if (input.stockStatus === 'has_stock') {
    const existing = input.existingStock ?? 0
    return {
      kind: 'none',
      totalStock: existing + input.purchaseAmount,
      unit: input.unit,
    }
  }

  if (input.stockStatus === 'known_zero') {
    return {
      kind: 'none',
      totalStock: input.purchaseAmount,
      unit: input.unit,
    }
  }

  return {
    kind: 'ask_previous_remainder',
    purchaseAmount: input.purchaseAmount,
    unit: input.unit,
  }
}

export function legacyStockStatusFromBoolean(productAlreadyInStock: boolean): ProductStockStatusKind {
  return productAlreadyInStock ? 'has_stock' : 'first_time'
}

export function applyInitialStockAnswer(
  question: InitialStockQuestion,
  answer: InitialStockAnswerInput,
): InitialStockResult | InitialStockQuestion {
  if (question.kind === 'none') {
    return {
      totalStock: question.totalStock,
      unit: question.unit,
      askedAboutPreviousRemainder: false,
      addedToExisting: true,
    }
  }

  if (question.kind === 'ask_previous_remainder') {
    if (answer.hadPreviousRemainder === false) {
      return {
        totalStock: question.purchaseAmount,
        unit: question.unit,
        askedAboutPreviousRemainder: true,
        addedToExisting: false,
      }
    }

    if (answer.hadPreviousRemainder === true) {
      return {
        kind: 'ask_remainder_amount',
        purchaseAmount: question.purchaseAmount,
        unit: question.unit,
      }
    }

    return question
  }

  if (question.kind === 'ask_remainder_amount') {
    const remainder = answer.previousRemainderAmount

    if (remainder == null || Number.isNaN(remainder) || remainder < 0) {
      return question
    }

    return {
      totalStock: remainder + question.purchaseAmount,
      unit: question.unit,
      askedAboutPreviousRemainder: true,
      addedToExisting: false,
    }
  }

  return question
}

export const INITIAL_STOCK_PREVIOUS_REMAINDER_QUESTION =
  'Hattest Du von diesem Dünger vor dem Kauf noch etwas übrig?'

export const INITIAL_STOCK_REMAINDER_AMOUNT_QUESTION =
  'Wie viel war ungefähr noch übrig?'

export const PACKAGE_COUNT_QUESTION = 'Wie viele Säcke hast Du gekauft?'
