import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../utils/http";

const {
  getOrCreateChatMock,
  getMessagesMock,
  getUserChatsMock,
  markAsReadMock,
  getChatByIdMock,
  getUnreadMessagesMock,
  deleteChatMock,
} = vi.hoisted(() => ({
  getOrCreateChatMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getUserChatsMock: vi.fn(),
  markAsReadMock: vi.fn(),
  getChatByIdMock: vi.fn(),
  getUnreadMessagesMock: vi.fn(),
  deleteChatMock: vi.fn(),
}));

vi.mock("../../src/services/chat.service", () => ({
  ChatService: {
    getOrCreateChat: getOrCreateChatMock,
    getMessages: getMessagesMock,
    getUserChats: getUserChatsMock,
    markAsRead: markAsReadMock,
    getChatById: getChatByIdMock,
    getUnreadMessages: getUnreadMessagesMock,
    deleteChat: deleteChatMock,
  },
}));

import {
  deleteChat,
  getChatInfo,
  getMessages,
  getOrCreateChat,
  getUnreadMessages,
  getUserChats,
  markAsRead,
} from "../../src/controllers/chat.controller";

describe("chat.controller tourist flow", () => {
  beforeEach(() => {
    getOrCreateChatMock.mockReset();
    getMessagesMock.mockReset();
    getUserChatsMock.mockReset();
    markAsReadMock.mockReset();
    getChatByIdMock.mockReset();
    getUnreadMessagesMock.mockReset();
    deleteChatMock.mockReset();
  });

  it("allows an authenticated tourist to create a chat with a guide", async () => {
    getOrCreateChatMock.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      body: {
        touristId: "tourist-1",
        guideId: "guide-1",
        touristName: "Ana",
        guideName: "Luis",
      },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await getOrCreateChat(req, res);

    expect(getOrCreateChatMock).toHaveBeenCalledWith("tourist-1", "guide-1", "Ana", "Luis");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a tourist creating chats for other users", async () => {
    const req = createMockRequest({
      body: {
        touristId: "tourist-1",
        guideId: "guide-1",
        touristName: "Ana",
        guideName: "Luis",
      },
      user: { uid: "tourist-2" },
    });
    const res = createMockResponse();

    await getOrCreateChat(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getOrCreateChatMock).not.toHaveBeenCalled();
  });

  it("returns the chats for the authenticated tourist", async () => {
    getUserChatsMock.mockResolvedValue([{ id: "chat-1" }]);

    const req = createMockRequest({
      params: { userId: "tourist-1" },
      query: { userType: "tourist" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await getUserChats(req, res);

    expect(getUserChatsMock).toHaveBeenCalledWith("tourist-1", "tourist");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a tourist reading another user's chats", async () => {
    const req = createMockRequest({
      params: { userId: "tourist-1" },
      query: { userType: "tourist" },
      user: { uid: "tourist-2" },
    });
    const res = createMockResponse();

    await getUserChats(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getUserChatsMock).not.toHaveBeenCalled();
  });

  it("rejects a tourist reading messages from a chat where they are not a participant", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      params: { chatId: "chat-1" },
      query: { limit: "20" },
      user: { uid: "tourist-2" },
    });
    const res = createMockResponse();

    await getMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getMessagesMock).not.toHaveBeenCalled();
  });

  it("returns messages to the tourist participant in chronological order", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });
    getMessagesMock.mockResolvedValue([
      { id: "m1", content: "primero" },
      { id: "m2", content: "segundo" },
    ]);

    const req = createMockRequest({
      params: { chatId: "chat-1" },
      query: { limit: "20" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await getMessages(req, res);

    expect(getMessagesMock).toHaveBeenCalledWith("chat-1", 20);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      messages: [
        { id: "m2", content: "segundo" },
        { id: "m1", content: "primero" },
      ],
    });
  });

  it("allows a tourist to mark their chat messages as read", async () => {
    const req = createMockRequest({
      params: { chatId: "chat-1" },
      body: { userId: "tourist-1" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await markAsRead(req, res);

    expect(markAsReadMock).toHaveBeenCalledWith("chat-1", "tourist-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a tourist marking messages as read for another user", async () => {
    const req = createMockRequest({
      params: { chatId: "chat-1" },
      body: { userId: "tourist-1" },
      user: { uid: "tourist-2" },
    });
    const res = createMockResponse();

    await markAsRead(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(markAsReadMock).not.toHaveBeenCalled();
  });

  it("returns chat info to the tourist participant", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      params: { chatId: "chat-1" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await getChatInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      chat: expect.objectContaining({ id: "chat-1" }),
    });
  });

  it("returns unread chat counters for the authenticated tourist", async () => {
    getUnreadMessagesMock.mockResolvedValue({
      totalUnread: 3,
      chats: [{ chatId: "chat-1", count: 3 }],
    });

    const req = createMockRequest({
      params: { userId: "tourist-1" },
      query: { userType: "tourist" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await getUnreadMessages(req, res);

    expect(getUnreadMessagesMock).toHaveBeenCalledWith("tourist-1", "tourist");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("allows a tourist participant to delete a chat", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      params: { chatId: "chat-1" },
      user: { uid: "tourist-1" },
    });
    const res = createMockResponse();

    await deleteChat(req, res);

    expect(deleteChatMock).toHaveBeenCalledWith("chat-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("chat.controller guide flow", () => {
  beforeEach(() => {
    getOrCreateChatMock.mockReset();
    getMessagesMock.mockReset();
    getUserChatsMock.mockReset();
    markAsReadMock.mockReset();
    getChatByIdMock.mockReset();
    getUnreadMessagesMock.mockReset();
    deleteChatMock.mockReset();
  });

  it("allows an authenticated guide to create a chat with a tourist", async () => {
    getOrCreateChatMock.mockResolvedValue({
      id: "chat-2",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      body: {
        touristId: "tourist-1",
        guideId: "guide-1",
        touristName: "Ana",
        guideName: "Luis",
      },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await getOrCreateChat(req, res);

    expect(getOrCreateChatMock).toHaveBeenCalledWith("tourist-1", "guide-1", "Ana", "Luis");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a guide creating chats for other guides", async () => {
    const req = createMockRequest({
      body: {
        touristId: "tourist-1",
        guideId: "guide-1",
        touristName: "Ana",
        guideName: "Luis",
      },
      user: { uid: "guide-2" },
    });
    const res = createMockResponse();

    await getOrCreateChat(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getOrCreateChatMock).not.toHaveBeenCalled();
  });

  it("returns the chats for the authenticated guide", async () => {
    getUserChatsMock.mockResolvedValue([{ id: "chat-2" }]);

    const req = createMockRequest({
      params: { userId: "guide-1" },
      query: { userType: "guide" },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await getUserChats(req, res);

    expect(getUserChatsMock).toHaveBeenCalledWith("guide-1", "guide");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns messages to the guide participant", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-2",
      touristId: "tourist-1",
      guideId: "guide-1",
    });
    getMessagesMock.mockResolvedValue([
      { id: "m1", content: "hola" },
      { id: "m2", content: "que tal" },
    ]);

    const req = createMockRequest({
      params: { chatId: "chat-2" },
      query: { limit: "10" },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await getMessages(req, res);

    expect(getMessagesMock).toHaveBeenCalledWith("chat-2", 10);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns unread chat counters for the authenticated guide", async () => {
    getUnreadMessagesMock.mockResolvedValue({
      totalUnread: 1,
      chats: [{ chatId: "chat-2", count: 1 }],
    });

    const req = createMockRequest({
      params: { userId: "guide-1" },
      query: { userType: "guide" },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await getUnreadMessages(req, res);

    expect(getUnreadMessagesMock).toHaveBeenCalledWith("guide-1", "guide");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("allows a guide participant to delete a chat", async () => {
    getChatByIdMock.mockResolvedValue({
      id: "chat-2",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const req = createMockRequest({
      params: { chatId: "chat-2" },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await deleteChat(req, res);

    expect(deleteChatMock).toHaveBeenCalledWith("chat-2");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});