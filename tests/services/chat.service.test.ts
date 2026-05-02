import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  collectionMock,
  batchFactoryMock,
  chatsAddMock,
  messagesAddMock,
  chatDocGetMock,
  chatDocUpdateMock,
  chatsByUserGetMock,
  existingChatGetMock,
  messagesByChatGetMock,
  markAsReadGetMock,
  unreadMessagesGetMock,
  guideUserGetMock,
  touristUserGetMock,
  batchUpdateMock,
  batchDeleteMock,
  batchCommitMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  batchFactoryMock: vi.fn(),
  chatsAddMock: vi.fn(),
  messagesAddMock: vi.fn(),
  chatDocGetMock: vi.fn(),
  chatDocUpdateMock: vi.fn(),
  chatsByUserGetMock: vi.fn(),
  existingChatGetMock: vi.fn(),
  messagesByChatGetMock: vi.fn(),
  markAsReadGetMock: vi.fn(),
  unreadMessagesGetMock: vi.fn(),
  guideUserGetMock: vi.fn(),
  touristUserGetMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  batchDeleteMock: vi.fn(),
  batchCommitMock: vi.fn(),
}));

vi.mock("../../src/config/firebase", () => ({
  db: {
    collection: collectionMock,
    batch: batchFactoryMock,
  },
}));

import { ChatService } from "../../src/services/chat.service";

function createQuerySnapshot(docs: Array<{ id: string; data: () => any; ref?: any }>) {
  return {
    empty: docs.length === 0,
    docs,
  };
}

function createTimestamp(value: Date) {
  return {
    toDate: () => value,
  };
}

function createQuery(collectionName: "chats" | "messages", clauses: Array<{ field: string; op: string; value: unknown }> = []) {
  return {
    where(field: string, op: string, value: unknown) {
      return createQuery(collectionName, [...clauses, { field, op, value }]);
    },
    limit() {
      return {
        get: () => resolveQuery(collectionName, clauses),
      };
    },
    get() {
      return resolveQuery(collectionName, clauses);
    },
  };
}

function resolveQuery(collectionName: "chats" | "messages", clauses: Array<{ field: string; op: string; value: unknown }>) {
  if (collectionName === "chats") {
    if (
      clauses.length === 2
      && clauses[0]?.field === "touristId"
      && clauses[1]?.field === "guideId"
    ) {
      return existingChatGetMock(clauses[0].value, clauses[1].value);
    }

    if (clauses.length === 1 && (clauses[0]?.field === "touristId" || clauses[0]?.field === "guideId")) {
      return chatsByUserGetMock(clauses[0].field, clauses[0].value);
    }
  }

  if (collectionName === "messages") {
    if (clauses.length === 1 && clauses[0]?.field === "chatId") {
      return messagesByChatGetMock(clauses[0].value);
    }

    if (
      clauses.length === 3
      && clauses[0]?.field === "chatId"
      && clauses[1]?.field === "senderId"
      && clauses[2]?.field === "read"
    ) {
      return markAsReadGetMock(clauses[0].value, clauses[1].value);
    }

    if (
      clauses.length === 2
      && clauses[0]?.field === "chatId"
      && clauses[1]?.field === "read"
    ) {
      return unreadMessagesGetMock(clauses[0].value);
    }
  }

  throw new Error(`Unexpected query for ${collectionName}: ${JSON.stringify(clauses)}`);
}

describe("chat.service", () => {
  beforeEach(() => {
    collectionMock.mockReset();
    batchFactoryMock.mockReset();
    chatsAddMock.mockReset();
    messagesAddMock.mockReset();
    chatDocGetMock.mockReset();
    chatDocUpdateMock.mockReset();
    chatsByUserGetMock.mockReset();
    existingChatGetMock.mockReset();
    messagesByChatGetMock.mockReset();
    markAsReadGetMock.mockReset();
    unreadMessagesGetMock.mockReset();
    guideUserGetMock.mockReset();
    touristUserGetMock.mockReset();
    batchUpdateMock.mockReset();
    batchDeleteMock.mockReset();
    batchCommitMock.mockReset();

    batchFactoryMock.mockReturnValue({
      update: batchUpdateMock,
      delete: batchDeleteMock,
      commit: batchCommitMock,
    });

    collectionMock.mockImplementation((name: string) => {
      if (name === "chats") {
        return {
          where: (field: string, op: string, value: unknown) => createQuery("chats", [{ field, op, value }]),
          add: chatsAddMock,
          doc: (id: string) => ({
            id,
            get: () => chatDocGetMock(id),
            update: (payload: unknown) => chatDocUpdateMock(id, payload),
          }),
        };
      }

      if (name === "messages") {
        return {
          where: (field: string, op: string, value: unknown) => createQuery("messages", [{ field, op, value }]),
          add: messagesAddMock,
        };
      }

      if (name === "usuarios") {
        return {
          doc: (bucket: string) => ({
            collection: () => ({
              doc: (id: string) => ({
                get: () => (bucket === "guias" ? guideUserGetMock(id) : touristUserGetMock(id)),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    });
  });

  it("returns an existing chat without creating a new one", async () => {
    existingChatGetMock.mockResolvedValue(
      createQuerySnapshot([
        {
          id: "chat-1",
          data: () => ({ touristId: "tourist-1", guideId: "guide-1" }),
        },
      ])
    );

    const chat = await ChatService.getOrCreateChat("tourist-1", "guide-1", "Ana", "Luis");

    expect(chat.id).toBe("chat-1");
    expect(chatsAddMock).not.toHaveBeenCalled();
  });

  it("creates a new chat when none exists", async () => {
    existingChatGetMock.mockResolvedValue(createQuerySnapshot([]));
    chatsAddMock.mockResolvedValue({ id: "chat-2" });

    const chat = await ChatService.getOrCreateChat("tourist-1", "guide-1", "Ana", "Luis");

    expect(chatsAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ touristId: "tourist-1", guideId: "guide-1", unreadCount: 0 })
    );
    expect(chat.id).toBe("chat-2");
  });

  it("saves a message and updates the chat summary", async () => {
    messagesAddMock.mockResolvedValue({ id: "message-1" });

    const message = await ChatService.saveMessage({
      chatId: "chat-1",
      senderId: "tourist-1",
      senderName: "Ana",
      senderType: "tourist",
      content: "Hola",
      timestamp: new Date("2026-04-29T10:00:00.000Z"),
      read: false,
    });

    expect(messagesAddMock).toHaveBeenCalled();
    expect(chatDocUpdateMock).toHaveBeenCalledWith(
      "chat-1",
      expect.objectContaining({ lastMessage: "Hola" })
    );
    expect(message.id).toBe("message-1");
  });

  it("sorts user chats by updatedAt and refreshes participant names", async () => {
    chatsByUserGetMock.mockResolvedValue(
      createQuerySnapshot([
        {
          id: "chat-1",
          data: () => ({
            touristId: "tourist-1",
            touristName: "Nombre viejo turista",
            guideId: "guide-1",
            guideName: "Nombre viejo guia",
            createdAt: createTimestamp(new Date("2026-04-29T08:00:00.000Z")),
            updatedAt: createTimestamp(new Date("2026-04-29T09:00:00.000Z")),
          }),
        },
        {
          id: "chat-2",
          data: () => ({
            touristId: "tourist-1",
            touristName: "Nombre viejo turista",
            guideId: "guide-2",
            guideName: "Nombre viejo guia 2",
            createdAt: createTimestamp(new Date("2026-04-29T07:00:00.000Z")),
            updatedAt: createTimestamp(new Date("2026-04-29T10:00:00.000Z")),
          }),
        },
      ])
    );
    guideUserGetMock.mockImplementation(async (id: string) => ({
      exists: true,
      data: () => ({
        "01_nombre": id === "guide-1" ? "Luis" : "Maria",
        "02_apellido": id === "guide-1" ? "Perez" : "Lopez",
      }),
    }));
    touristUserGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        "01_nombre": "Ana",
        "02_apellido": "Garcia",
      }),
    });

    const chats = await ChatService.getUserChats("tourist-1", "tourist");

    expect(chats[0]?.id).toBe("chat-2");
    expect(chats[0]?.guideName).toBe("Maria Lopez");
    expect(chats[0]?.touristName).toBe("Ana Garcia");
  });

  it("marks unread messages as read and resets the unread counter", async () => {
    markAsReadGetMock.mockResolvedValue(
      createQuerySnapshot([
        { id: "m1", data: () => ({}), ref: { id: "m1" } },
        { id: "m2", data: () => ({}), ref: { id: "m2" } },
      ])
    );
    batchCommitMock.mockResolvedValue(undefined);

    await ChatService.markAsRead("chat-1", "tourist-1");

    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    expect(chatDocUpdateMock).toHaveBeenCalledWith("chat-1", { unreadCount: 0 });
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it("returns messages sorted by timestamp and limited", async () => {
    messagesByChatGetMock.mockResolvedValue(
      createQuerySnapshot([
        {
          id: "m1",
          data: () => ({ content: "segundo", timestamp: createTimestamp(new Date("2026-04-29T10:00:00.000Z")) }),
        },
        {
          id: "m2",
          data: () => ({ content: "primero", timestamp: createTimestamp(new Date("2026-04-29T09:00:00.000Z")) }),
        },
      ])
    );

    const messages = await ChatService.getMessages("chat-1", 1);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("primero");
  });

  it("aggregates unread messages that were sent by the other participant", async () => {
    chatsByUserGetMock.mockResolvedValue(
      createQuerySnapshot([
        { id: "chat-1", data: () => ({}) },
        { id: "chat-2", data: () => ({}) },
      ])
    );
    unreadMessagesGetMock.mockImplementation(async (chatId: unknown) => {
      if (chatId === "chat-1") {
        return createQuerySnapshot([
          {
            id: "m1",
            data: () => ({ senderId: "guide-1", senderName: "Luis", content: "Hola", timestamp: createTimestamp(new Date("2026-04-29T11:00:00.000Z")) }),
          },
          {
            id: "m2",
            data: () => ({ senderId: "tourist-1", senderName: "Ana", content: "Propio", timestamp: createTimestamp(new Date("2026-04-29T11:05:00.000Z")) }),
          },
        ]);
      }

      return createQuerySnapshot([
        {
          id: "m3",
          data: () => ({ senderId: "guide-2", senderName: "Maria", content: "Nuevo", timestamp: createTimestamp(new Date("2026-04-29T12:00:00.000Z")) }),
        },
      ]);
    });

    const unread = await ChatService.getUnreadMessages("tourist-1", "tourist");

    expect(unread.totalUnread).toBe(2);
    expect(unread.chats).toHaveLength(2);
    expect(unread.chats[0]?.chatId).toBe("chat-1");
  });

  it("deletes a chat and all its messages in a batch", async () => {
    messagesByChatGetMock.mockResolvedValue(
      createQuerySnapshot([
        { id: "m1", data: () => ({}), ref: { id: "m1" } },
        { id: "m2", data: () => ({}), ref: { id: "m2" } },
      ])
    );
    batchCommitMock.mockResolvedValue(undefined);

    const result = await ChatService.deleteChat("chat-1");

    expect(batchDeleteMock).toHaveBeenCalledTimes(3);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});