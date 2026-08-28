# Verific validation

Verific coordinates model validation and turns validator findings into errors an application can present.

## Language

**Scope**:
A group of registrations that are validated together.
_Avoid_: Form context, validation context

**Registration**:
One schema and model pairing that belongs to a scope.
_Avoid_: Validator, field

**Issue**:
Structured information about one validation failure, including its path and original validator finding.
_Avoid_: Error message

**Error**:
A ready-to-render string derived from an issue.
_Avoid_: Issue, validation result

**Semantic identifier**:
Locale-independent meaning assigned to an issue, such as `invalidEmail` or `minLength`.
_Avoid_: Error code, translation key

**Message resolver**:
A policy that turns an issue's semantic identifier and values into an error.
_Avoid_: Formatter, translator

**Locale adapter**:
A message resolver that connects Verific to a locale library.
_Avoid_: Translation plugin

**Transformed output**:
The validated value produced by a schema, which may differ from the application-owned model.
_Avoid_: Form model, parsed input
