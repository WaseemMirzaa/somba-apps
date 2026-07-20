import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Key/value platform settings (FX rate, COD cap, zones JSON, feature flags). */
@Entity('settings')
export class Setting {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
