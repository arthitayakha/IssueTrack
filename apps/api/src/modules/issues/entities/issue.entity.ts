import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Category } from "../../categories/entities/category.entity";
import { App } from "../../apps/entities/app.entity";
import { Comment } from "../../comments/entities/comment.entity";
import { Attachment } from "../../attachments/entities/attachment.entity";
import { WorkSession } from "../../work-sessions/entities/work-session.entity";
import { IssueStatus } from "../../issue-statuses/entities/issue-status.entity";
import { IssuePriority } from "../../issue-priorities/entities/issue-priority.entity";
import { Label } from "../../labels/entities/label.entity";
import { User } from "../../auth/entities/user.entity";

@Entity("issues")
export class Issue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "issue_number", type: "varchar", length: 12, nullable: true })
  issueNumber!: string | null;

  @Column({ name: "programmer_id", type: "int", nullable: true })
  programmerId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "programmer_id" })
  programmer?: User;

  @Column({ name: "category_id", type: "int", nullable: true })
  categoryId!: number | null;

  @ManyToOne(() => Category, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category?: Category;

  @Column({ name: "custom_category", type: "varchar", length: 500, nullable: true })
  customCategory!: string | null;

  @Column({ name: "app_id", type: "int", nullable: true })
  appId!: number | null;

  @ManyToOne(() => App, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "app_id" })
  app?: App;

  @Column({ type: "varchar", length: 300 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  /** วิเคราะห์ / สาเหตุ — filled in once a rule unlocks the fields. */
  @Column({ name: "analysis_cause", type: "text", nullable: true })
  analysisCause!: string | null;

  /** การแก้ไข — the fix applied for this issue. */
  @Column({ type: "text", nullable: true })
  resolution!: string | null;

  /**
   * Set by the `issue.open_analysis` rule action when its rule fires (the
   * status gate lives in the rule's conditions); clients cannot flip it
   * through the update endpoint.
   */
  @Column({ name: "is_analysis_open", default: false })
  isAnalysisOpen!: boolean;

  /**
   * Set by the `issue.open_resolution` rule action when its rule fires (the
   * status gate lives in the rule's conditions); clients cannot flip it
   * through the update endpoint.
   */
  @Column({ name: "is_resolution_open", default: false })
  isResolutionOpen!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "tracked_duration", default: 0 })
  trackedDuration!: number;

  @Column({ name: "actual_fix_duration", type: "int", nullable: true })
  actualFixDuration!: number | null;

  /**
   * The three states of the "actual fix time" field:
   * - `timeEntryUnlocked` — an `issue.allow_time_entry` rule granted it for
   *   the card's current status (moving/creating the card clears it again, so
   *   the rules re-grant it per status).
   * - `timeEntryEverGranted` — the field has been shown at least once; cards
   *   that never passed the gate keep the field hidden, cards that did stay
   *   visible read-only once the grant lapses.
   */
  @Column({ name: "time_entry_unlocked", default: false })
  timeEntryUnlocked!: boolean;

  @Column({ name: "time_entry_ever_granted", default: false })
  timeEntryEverGranted!: boolean;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ name: "customer_id", type: "int", nullable: true })
  customerId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer?: User;

  @Column({ name: "status_id", type: "int", nullable: true })
  statusId!: number | null;

  @ManyToOne(() => IssueStatus, { nullable: true })
  @JoinColumn({ name: "status_id" })
  status?: IssueStatus;

  @Column({ name: "priority_id", type: "int", nullable: true })
  priorityId!: number | null;

  @ManyToOne(() => IssuePriority, { nullable: true })
  @JoinColumn({ name: "priority_id" })
  priority?: IssuePriority;

  @Column({ name: "label_id", type: "int", nullable: true })
  labelId!: number | null;

  @ManyToOne(() => Label, { nullable: true })
  @JoinColumn({ name: "label_id" })
  label?: Label;

  @ManyToMany(() => Label, { nullable: true })
  @JoinTable({
    name: "issue_labels",
    joinColumn: { name: "issue_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "label_id", referencedColumnName: "id" },
  })
  labels?: Label[];

  @Column({ name: "is_locked", default: false })
  isLocked!: boolean;

  /**
   * One-shot release from a status lock (an active `issue.lock` rule covers
   * the card's status): while set the card may leave it once — the move
   * itself clears the flag, so landing in another locked status locks again.
   */
  @Column({ name: "lock_exempted", default: false })
  lockExempted!: boolean;

  /**
   * วันที่เริ่มรับเรื่อง — stamped when the card first lands in the receiving
   * status ("รอดำเนินการ", id 2) or is created directly there; NULL until then.
   */
  @Column({ name: "received_at", type: "timestamptz", nullable: true })
  receivedAt!: Date | null;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ name: "deleted_by", type: "int", nullable: true })
  deletedBy!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "deleted_by" })
  deletedByUser?: User;

  @OneToMany(() => Comment, (comment) => comment.issue)
  comments?: Comment[];

  @OneToMany(() => Attachment, (attachment) => attachment.issue)
  attachments?: Attachment[];

  @OneToMany(() => WorkSession, (session) => session.issue)
  workSessions?: WorkSession[];
}
