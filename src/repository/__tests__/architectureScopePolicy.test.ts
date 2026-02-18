import {
  getReadOnlyReason,
  isObjectTypeWritableForScope,
} from '../architectureScopePolicy';

describe('architectureScopePolicy', () => {
  test('Business Unit scope allows Business + Application + Technology layers', () => {
    expect(isObjectTypeWritableForScope('Business Unit', 'Enterprise')).toBe(
      true,
    );
    expect(isObjectTypeWritableForScope('Business Unit', 'Capability')).toBe(
      true,
    );
    expect(isObjectTypeWritableForScope('Business Unit', 'Application')).toBe(
      true,
    );
    expect(isObjectTypeWritableForScope('Business Unit', 'Technology')).toBe(
      true,
    );

    expect(getReadOnlyReason('Business Unit', 'Programme')).toMatch(
      /Read-only in Business Unit scope/i,
    );
  });

  test('Domain scope allows focused Business + Application modeling', () => {
    expect(isObjectTypeWritableForScope('Domain', 'Capability')).toBe(true);
    expect(isObjectTypeWritableForScope('Domain', 'BusinessService')).toBe(
      true,
    );
    expect(isObjectTypeWritableForScope('Domain', 'Application')).toBe(true);
    expect(isObjectTypeWritableForScope('Domain', 'ApplicationService')).toBe(
      true,
    );

    expect(isObjectTypeWritableForScope('Domain', 'Enterprise')).toBe(false);
    expect(isObjectTypeWritableForScope('Domain', 'Technology')).toBe(false);
    expect(isObjectTypeWritableForScope('Domain', 'Programme')).toBe(false);

    expect(getReadOnlyReason('Domain', 'Enterprise')).toMatch(
      /Read-only in Domain scope/i,
    );
  });

  test('Programme scope allows transformation-centric elements', () => {
    expect(isObjectTypeWritableForScope('Programme', 'Programme')).toBe(true);
    expect(isObjectTypeWritableForScope('Programme', 'Project')).toBe(true);
    expect(isObjectTypeWritableForScope('Programme', 'Capability')).toBe(true);
    expect(isObjectTypeWritableForScope('Programme', 'Application')).toBe(true);

    expect(isObjectTypeWritableForScope('Programme', 'Technology')).toBe(false);
    expect(getReadOnlyReason('Programme', 'Technology')).toMatch(
      /Read-only in Programme scope/i,
    );
  });
});
