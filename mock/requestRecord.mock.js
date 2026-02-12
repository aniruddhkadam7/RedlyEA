module.exports = {
  'GET /api/currentUser': {
    data: {
      name: 'Test User',
      avatar: '',
      userid: '00000001',
      email: 'test@example.com',
      signature: '',
      title: 'Architect',
      group: 'EA',
      tags: [],
      notifyCount: 0,
      unreadCount: 0,
      country: 'US',
      geographic: {
        province: { label: '', key: '' },
        city: { label: '', key: '' },
      },
      address: '',
      phone: '',
    },
  },
  'GET /api/notices': {
    data: [],
  },
  'POST /api/login/outLogin': { data: {}, success: true },
  'POST /api/login/account': {
    status: 'ok',
    type: 'account',
    currentAuthority: 'admin',
  },
};
