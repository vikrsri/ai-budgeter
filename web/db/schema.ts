import {index,integer,primaryKey,sqliteTable,text} from "drizzle-orm/sqlite-core";
export const transactions=sqliteTable("transactions",{
 owner:text("owner").notNull(),id:text("id").notNull(),date:text("date").notNull(),merchant:text("merchant").notNull(),amount:integer("amount").notNull(),source:text("source").notNull(),category:text("category").notNull(),kind:text("kind").notNull(),importedAt:text("imported_at").notNull()
},t=>[primaryKey({columns:[t.owner,t.id]}),index("idx_transactions_owner_date").on(t.owner,t.date)]);
