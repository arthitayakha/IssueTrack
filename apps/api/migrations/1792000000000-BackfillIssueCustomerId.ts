import { QueryRunner } from "typeorm";

export class BackfillIssueCustomerId1792000000000 {
  name = "BackfillIssueCustomerId1792000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE issues i
      SET customer_id = al.actor_id
      FROM activity_logs al
      WHERE i.customer_id IS NULL
        AND al.action = 'card.created'
        AND al.entity_id = i.id
        AND al.actor_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE issues i
      SET customer_id = NULL
      FROM activity_logs al
      WHERE al.action = 'card.created'
        AND al.entity_id = i.id
        AND al.actor_id IS NOT NULL
        AND i.customer_id = al.actor_id
    `);
  }
}
