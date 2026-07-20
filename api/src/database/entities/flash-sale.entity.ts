import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('flash_sales')
export class FlashSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'float' })
  flashPrice: number;

  @Column({ type: 'int', default: 0 })
  discount: number;

  @Column({ type: 'varchar', nullable: true })
  startsAt: string | null;

  @Column({ type: 'varchar', nullable: true })
  endsAt: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
