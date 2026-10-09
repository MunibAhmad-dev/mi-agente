import type { Model } from 'mongoose';

import actionSchema from './schema/action';
import aclEntrySchema from './schema/aclEntry';
import accessRoleSchema from './schema/accessRole';
import agentSchema from './schema/agent';
import agentApiKeySchema from './schema/agentApiKey';
import agentCategorySchema from './schema/agentCategory';
import assistantSchema from './schema/assistant';
import auditLogSchema from './schema/auditLog';
import balanceSchema from './schema/balance';
import bannerSchema from './schema/banner';
import chatProjectSchema from './schema/chatProject';
import configSchema from './schema/config';
import conversationTagSchema from './schema/conversationTag';
import convoSchema from './schema/convo';
import fileSchema from './schema/file';
import toolFavoriteSchema from './schema/favorite';
import groupSchema from './schema/group';
import keySchema from './schema/key';
import mcpServerSchema from './schema/mcpServer';
import memorySchema from './schema/memory';
import messageSchema from './schema/message';
import pluginAuthSchema from './schema/pluginAuth';
import presetSchema from './schema/preset';
import promptSchema from './schema/prompt';
import promptGroupSchema from './schema/promptGroup';
import roleSchema from './schema/role';
import sessionSchema from './schema/session';
import shareSchema from './schema/share';
import skillSchema from './schema/skill';
import skillFileSchema from './schema/skillFile';
import skillSyncCredentialSchema from './schema/skillSyncCredential';
import skillSyncStatusSchema from './schema/skillSyncStatus';
import systemGrantSchema from './schema/systemGrant';
import tokenSchema from './schema/token';
import toolCallSchema from './schema/toolCall';
import transactionSchema from './schema/transaction';
import userSchema from './schema/user';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;
type Mongoose = typeof import('mongoose');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reg(m: Mongoose, name: string, schema: unknown): AnyModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (m.models[name] ?? m.model(name, schema as any)) as AnyModel;
}

export type CreatedModels = {
  User: AnyModel;
  Session: AnyModel;
  Token: AnyModel;
  Role: AnyModel;
  Balance: AnyModel;
  Key: AnyModel;
  File: AnyModel;
  MemoryEntry: AnyModel;
  ToolFavorite: AnyModel;
  Group: AnyModel;
  AccessRole: AnyModel;
  AclEntry: AnyModel;
  SystemGrant: AnyModel;
  AuditLog: AnyModel;
  Agent: AnyModel;
  AgentApiKey: AnyModel;
  AgentCategory: AnyModel;
  MCPServer: AnyModel;
  Action: AnyModel;
  Assistant: AnyModel;
  Banner: AnyModel;
  ToolCall: AnyModel;
  Preset: AnyModel;
  PluginAuth: AnyModel;
  ConversationTag: AnyModel;
  Message: AnyModel;
  Conversation: AnyModel;
  ChatProject: AnyModel;
  Transaction: AnyModel;
  Prompt: AnyModel;
  PromptGroup: AnyModel;
  SharedLink: AnyModel;
  Skill: AnyModel;
  SkillFile: AnyModel;
  SkillSyncCredential: AnyModel;
  SkillSyncStatus: AnyModel;
  Config: AnyModel;
};

export function createModels(mongoose: Mongoose): CreatedModels {
  return {
    User: reg(mongoose, 'User', userSchema),
    Session: reg(mongoose, 'Session', sessionSchema),
    Token: reg(mongoose, 'Token', tokenSchema),
    Role: reg(mongoose, 'Role', roleSchema),
    Balance: reg(mongoose, 'Balance', balanceSchema),
    Key: reg(mongoose, 'Key', keySchema),
    File: reg(mongoose, 'File', fileSchema),
    MemoryEntry: reg(mongoose, 'MemoryEntry', memorySchema),
    ToolFavorite: reg(mongoose, 'ToolFavorite', toolFavoriteSchema),
    Group: reg(mongoose, 'Group', groupSchema),
    AccessRole: reg(mongoose, 'AccessRole', accessRoleSchema),
    AclEntry: reg(mongoose, 'AclEntry', aclEntrySchema),
    SystemGrant: reg(mongoose, 'SystemGrant', systemGrantSchema),
    AuditLog: reg(mongoose, 'AuditLog', auditLogSchema),
    Agent: reg(mongoose, 'Agent', agentSchema),
    AgentApiKey: reg(mongoose, 'AgentApiKey', agentApiKeySchema),
    AgentCategory: reg(mongoose, 'AgentCategory', agentCategorySchema),
    MCPServer: reg(mongoose, 'MCPServer', mcpServerSchema),
    Action: reg(mongoose, 'Action', actionSchema),
    Assistant: reg(mongoose, 'Assistant', assistantSchema),
    Banner: reg(mongoose, 'Banner', bannerSchema),
    ToolCall: reg(mongoose, 'ToolCall', toolCallSchema),
    Preset: reg(mongoose, 'Preset', presetSchema),
    PluginAuth: reg(mongoose, 'PluginAuth', pluginAuthSchema),
    ConversationTag: reg(mongoose, 'ConversationTag', conversationTagSchema),
    Message: reg(mongoose, 'Message', messageSchema),
    Conversation: reg(mongoose, 'Conversation', convoSchema),
    ChatProject: reg(mongoose, 'ChatProject', chatProjectSchema),
    Transaction: reg(mongoose, 'Transaction', transactionSchema),
    Prompt: reg(mongoose, 'Prompt', promptSchema),
    PromptGroup: reg(mongoose, 'PromptGroup', promptGroupSchema),
    SharedLink: reg(mongoose, 'SharedLink', shareSchema),
    Skill: reg(mongoose, 'Skill', skillSchema),
    SkillFile: reg(mongoose, 'SkillFile', skillFileSchema),
    SkillSyncCredential: reg(mongoose, 'SkillSyncCredential', skillSyncCredentialSchema),
    SkillSyncStatus: reg(mongoose, 'SkillSyncStatus', skillSyncStatusSchema),
    Config: reg(mongoose, 'Config', configSchema),
  };
}
