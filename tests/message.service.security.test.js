const messageService = require('../modules/messages/message.service');
const Conversation = require('../modules/messages/conversation.model');
const Message = require('../modules/messages/message.model');

jest.mock('../modules/messages/conversation.model');
jest.mock('../modules/messages/message.model');

describe('message.service security checks', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('sendMessageService throws NotFoundError when conversation not found', async () => {
    Conversation.findById = jest.fn().mockResolvedValue(null);

    await expect(
      messageService.sendMessageService({ conversationId: 'cid', senderId: 'sid', content: 'hi' })
    ).rejects.toThrow('Conversation not found');
  });

  test('sendMessageService throws AuthorizationError when sender not part of conversation', async () => {
    const conv = { customerId: 'a', vendorId: 'b', _id: 'conv1' };
    Conversation.findById = jest.fn().mockResolvedValue(conv);

    await expect(
      messageService.sendMessageService({ conversationId: 'cid', senderId: 'other', content: 'hi' })
    ).rejects.toThrow('You are not part of this conversation');
  });
});
