// Example of how to use the BaseRepository and @Repository decorator
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { Repository } from '../lib/decorators';
import { BaseRepository } from '../lib/Repository';

// Example schema
const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Repository with decorator (recommended)
@Repository({
  table: users,
  databaseService: 'MyDatabase', // Name of your database service
  name: 'UserRepository', // Optional service name
})
export class UserRepository extends BaseRepository<typeof users> {
  // Custom methods specific to User
  public async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }

  public async findActiveUsers() {
    // Example of custom query with the inherited db connection
    return this.db.select().from(users).where('' /* your custom conditions */);
  }

  public async updateEmail(id: string, newEmail: string) {
    return this.updateById(id, { email: newEmail });
  }
}
