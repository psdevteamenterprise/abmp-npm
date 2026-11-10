const {
  describeOptChange,
  isTrackedOptField,
  OPT_ACTIONS,
} = require('../../public/Utils/optChangeTracking');

describe('describeOptChange', () => {
  test('unticking "show me in the directory" is a directory opt-out', () => {
    expect(
      describeOptChange({ field: 'optOut', previousValue: false, nextValue: true, saved: true })
    ).toEqual({
      buttonName: 'Directory Opt In/Out',
      data: {
        field: 'optOut',
        previousValue: false,
        nextValue: true,
        action: OPT_ACTIONS.OPT_OUT,
        saved: true,
      },
    });
  });

  test('ticking it again is a directory opt-in', () => {
    const { data } = describeOptChange({
      field: 'optOut',
      previousValue: true,
      nextValue: false,
      saved: true,
    });
    expect(data.action).toBe(OPT_ACTIONS.OPT_IN);
  });

  test('showWixUrl is inverted: false means the member opted out of the free website', () => {
    expect(
      describeOptChange({ field: 'showWixUrl', previousValue: true, nextValue: false, saved: true })
        .data.action
    ).toBe(OPT_ACTIONS.OPT_OUT);
    expect(
      describeOptChange({ field: 'showWixUrl', previousValue: false, nextValue: true, saved: true })
        .data.action
    ).toBe(OPT_ACTIONS.OPT_IN);
    expect(
      describeOptChange({ field: 'showWixUrl', previousValue: true, nextValue: false, saved: true })
        .buttonName
    ).toBe('Free Website Opt In/Out');
  });

  test('a member never written (undefined) counts as opted in to the directory', () => {
    const { data } = describeOptChange({
      field: 'optOut',
      previousValue: undefined,
      nextValue: true,
      saved: true,
    });
    expect(data.previousValue).toBe(false);
    expect(data.action).toBe(OPT_ACTIONS.OPT_OUT);
  });

  test('saving the same value again is recorded as unchanged', () => {
    const { data } = describeOptChange({
      field: 'optOut',
      previousValue: true,
      nextValue: true,
      saved: true,
    });
    expect(data.action).toBe(OPT_ACTIONS.UNCHANGED);
  });

  test('a failed save is still recorded, flagged as not saved', () => {
    const { data } = describeOptChange({
      field: 'optOut',
      previousValue: false,
      nextValue: true,
      saved: false,
    });
    expect(data.saved).toBe(false);
    expect(data.action).toBe(OPT_ACTIONS.OPT_OUT);
  });

  test('fields that are not opt checkboxes are ignored', () => {
    expect(
      describeOptChange({ field: 'firstName', previousValue: 'a', nextValue: 'b', saved: true })
    ).toBeNull();
    expect(isTrackedOptField('optOut')).toBe(true);
    expect(isTrackedOptField('showWebsite')).toBe(false);
  });
});
