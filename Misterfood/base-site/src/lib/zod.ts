export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const NO_DEFAULT = Symbol('no-default');

type Infer<T> = T extends Schema<infer U> ? U : never;

interface Schema<T> {
  parse(value: unknown, path?: string): T;
  optional(): Schema<T | undefined>;
  default(value: T): Schema<T>;
}

abstract class BaseSchema<T> implements Schema<T> {
  protected isOptional = false;
  protected defaultValue: T | typeof NO_DEFAULT = NO_DEFAULT;

  optional(): Schema<T | undefined> {
    this.isOptional = true;
    return (this as unknown) as Schema<T | undefined>;
  }

  default(value: T): Schema<T> {
    this.defaultValue = value;
    return this;
  }

  parse(value: unknown, path = 'value'): T {
    if (value === undefined || value === null) {
      if (this.defaultValue !== NO_DEFAULT) {
        return this.defaultValue as T;
      }
      if (this.isOptional) {
        return undefined as unknown as T;
      }
      throw new ValidationError(`${path} est requis.`);
    }
    return this.parseInternal(value, path);
  }

  protected abstract parseInternal(value: unknown, path: string): T;
}

class StringSchema extends BaseSchema<string> {
  private minLength?: number;
  private maxLength?: number;
  private shouldEmail = false;

  min(n: number) {
    this.minLength = n;
    return this;
  }

  max(n: number) {
    this.maxLength = n;
    return this;
  }

  email() {
    this.shouldEmail = true;
    return this;
  }

  protected parseInternal(value: unknown, path: string): string {
    if (typeof value !== 'string') {
      throw new ValidationError(`${path} doit être une chaîne.`);
    }
    if (this.minLength != null && value.length < this.minLength) {
      throw new ValidationError(`${path} doit contenir au moins ${this.minLength} caractères.`);
    }
    if (this.maxLength != null && value.length > this.maxLength) {
      throw new ValidationError(`${path} doit contenir au plus ${this.maxLength} caractères.`);
    }
    if (this.shouldEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        throw new ValidationError(`${path} doit être un email valide.`);
      }
    }
    return value;
  }
}

class NumberSchema extends BaseSchema<number> {
  private mustInt = false;
  private mustPositive = false;
  private mustNonNegative = false;

  int() {
    this.mustInt = true;
    return this;
  }

  positive() {
    this.mustPositive = true;
    return this;
  }

  nonnegative() {
    this.mustNonNegative = true;
    return this;
  }

  protected parseInternal(value: unknown, path: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new ValidationError(`${path} doit être un nombre.`);
    }
    if (this.mustInt && !Number.isInteger(value)) {
      throw new ValidationError(`${path} doit être un entier.`);
    }
    if (this.mustPositive && value <= 0) {
      throw new ValidationError(`${path} doit être strictement positif.`);
    }
    if (this.mustNonNegative && value < 0) {
      throw new ValidationError(`${path} doit être positif ou nul.`);
    }
    return value;
  }
}

class EnumSchema<T extends string> extends BaseSchema<T> {
  constructor(private values: readonly T[]) {
    super();
  }

  protected parseInternal(value: unknown, path: string): T {
    if (typeof value !== 'string') {
      throw new ValidationError(`${path} doit être une valeur parmi ${this.values.join(', ')}.`);
    }
    if (!this.values.includes(value as T)) {
      throw new ValidationError(`${path} doit être une valeur parmi ${this.values.join(', ')}.`);
    }
    return value as T;
  }
}

class ArraySchema<T> extends BaseSchema<T[]> {
  private minItems?: number;
  private maxItems?: number;

  constructor(private inner: Schema<T>) {
    super();
  }

  min(n: number) {
    this.minItems = n;
    return this;
  }

  max(n: number) {
    this.maxItems = n;
    return this;
  }

  protected parseInternal(value: unknown, path: string): T[] {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${path} doit être un tableau.`);
    }
    const result = value.map((item, index) => this.inner.parse(item, `${path}[${index}]`));
    if (this.minItems != null && result.length < this.minItems) {
      throw new ValidationError(`${path} doit contenir au moins ${this.minItems} élément(s).`);
    }
    if (this.maxItems != null && result.length > this.maxItems) {
      throw new ValidationError(`${path} doit contenir au plus ${this.maxItems} élément(s).`);
    }
    return result;
  }
}

class ObjectSchema<T extends Record<string, any>> extends BaseSchema<T> {
  constructor(private shape: { [K in keyof T]: Schema<T[K]> }) {
    super();
  }

  protected parseInternal(value: unknown, path: string): T {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${path} doit être un objet.`);
    }
    const result: Record<string, any> = {};
    for (const key of Object.keys(this.shape)) {
      const schema = this.shape[key as keyof T];
      result[key] = schema.parse((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return result as T;
  }
}

class RecordSchema<T> extends BaseSchema<Record<string, T>> {
  constructor(private inner: Schema<T>) {
    super();
  }

  protected parseInternal(value: unknown, path: string): Record<string, T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${path} doit être un objet.`);
    }
    const result: Record<string, T> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = this.inner.parse(val, `${path}.${key}`);
    }
    return result;
  }
}

const zFactory = {
  object<T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }) {
    return new ObjectSchema<T>(shape);
  },
  string() {
    return new StringSchema();
  },
  number() {
    return new NumberSchema();
  },
  array<T>(schema: Schema<T>) {
    return new ArraySchema(schema);
  },
  enum<T extends string>(values: readonly T[]) {
    return new EnumSchema(values);
  },
  record<T>(schema: Schema<T>) {
    return new RecordSchema(schema);
  },
};

export const z = zFactory;

export type inferType<T extends Schema<any>> = Infer<T>;
