jest.mock('../elevated-modules', () => ({ wixData: {} }));
jest.mock('psdev-task-manager', () => ({ taskManager: jest.fn() }));
jest.mock('../members-data-methods', () => ({ getMembersWithWixUrl: jest.fn() }));
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  getSiteConfigs: jest.fn(),
}));
jest.mock('../tasks/tasks-helpers-methods', () => ({
  getAWSTokens: jest.fn(),
  uploadMembersSitemap: jest.fn(),
}));

const { getMembersWithWixUrl } = require('../members-data-methods');
const { getAWSTokens, uploadMembersSitemap } = require('../tasks/tasks-helpers-methods');
const { updateSiteMapS3 } = require('../tasks/tasks-process-methods');
const { getSiteConfigs } = require('../utils');

const members = count => Array.from({ length: count }, (_, i) => ({ url: `member-${i}` }));

describe('updateSiteMapS3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    getAWSTokens.mockResolvedValue({ AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' });
    getSiteConfigs.mockResolvedValue('ANP');
  });

  afterEach(() => jest.restoreAllMocks());

  test('uploads one file per 10,000 members', async () => {
    getMembersWithWixUrl.mockResolvedValue(members(10001));
    uploadMembersSitemap.mockResolvedValue(undefined);

    await updateSiteMapS3();

    expect(uploadMembersSitemap.mock.calls.map(([args]) => args.destinationFileName)).toEqual([
      'profiles-sitemap-1.xml',
      'profiles-sitemap-2.xml',
    ]);
  });

  test('rejects when an upload fails, so the task is not recorded as a success', async () => {
    getMembersWithWixUrl.mockResolvedValue(members(3));
    uploadMembersSitemap.mockRejectedValue(new Error('S3 PUT failed 404 Not Found: NoSuchBucket'));

    await expect(updateSiteMapS3()).rejects.toThrow('NoSuchBucket');
  });
});
