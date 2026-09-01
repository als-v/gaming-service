import type { ValidationError } from "class-validator";

import { ValidationFailedException } from "./domain-http-exception.js";
import type { ValidationErrorItem } from "./problem-details.js";

function flatten(errors: ValidationError[], parentPath: string): ValidationErrorItem[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownConstraints = Object.values(error.constraints ?? {});
    const ownItem: ValidationErrorItem[] = ownConstraints.length
      ? [{ field: path, constraints: ownConstraints }]
      : [];
    const childItems = error.children?.length ? flatten(error.children, path) : [];
    return [...ownItem, ...childItems];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): ValidationFailedException {
  return new ValidationFailedException(flatten(errors, ""));
}
