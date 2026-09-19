import {sql} from "drizzle-orm";
import {index,integer,primaryKey,sqliteTable,text,uniqueIndex} from "drizzle-orm/sqlite-core";
export const transactions=sqliteTable("transactions",{
 owner:text("owner").notNull(),id:text("id").notNull(),date:text("date").notNull(),merchant:text("merchant").notNull(),amount:integer("amount").notNull(),source:text("source").notNull(),category:text("category").notNull(),kind:text("kind").notNull(),importedAt:text("imported_at").notNull(),provider:text("provider").notNull().default("csv"),accountId:text("account_id"),pending:integer("pending").notNull().default(0),currency:text("currency").notNull().default("USD")
},t=>[primaryKey({columns:[t.owner,t.id]}),index("idx_transactions_owner_date").on(t.owner,t.date)]);
export const plaidItems=sqliteTable("plaid_items",{
 owner:text("owner").notNull(),id:text("id").notNull(),accessToken:text("access_token").notNull(),institutionId:text("institution_id"),institution:text("institution").notNull().default("Connected card"),cursor:text("cursor").notNull().default(""),status:text("status").notNull().default("connected"),errorCode:text("error_code"),lastSynced:text("last_synced"),syncLock:text("sync_lock"),syncLockUntil:integer("sync_lock_until").notNull().default(0),createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.owner,t.id]}),uniqueIndex("idx_plaid_owner_active_institution").on(t.owner,t.institutionId).where(sql`${t.status} <> 'disconnected'`)]);
export const plaidAccounts=sqliteTable("plaid_accounts",{
 owner:text("owner").notNull(),id:text("id").notNull(),itemId:text("item_id").notNull(),source:text("source").notNull(),name:text("name").notNull(),mask:text("mask"),active:integer("active").notNull().default(1)
},t=>[primaryKey({columns:[t.owner,t.id]}),index("idx_plaid_accounts_owner_item").on(t.owner,t.itemId)]);
export const plaidLinkSessions=sqliteTable("plaid_link_sessions",{
 owner:text("owner").notNull(),id:text("id").notNull(),linkToken:text("link_token").notNull(),updateItemId:text("update_item_id"),itemId:text("item_id"),expiresAt:integer("expires_at").notNull(),state:text("state").notNull().default("pending")
},t=>[primaryKey({columns:[t.owner,t.id]})]);
