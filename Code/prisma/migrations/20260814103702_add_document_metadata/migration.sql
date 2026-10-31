-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "firNumber" TEXT,
    "firDate" TIMESTAMP(3),
    "district" TEXT,
    "subDivision" TEXT,
    "policeStation" TEXT,
    "propertyLoss" DOUBLE PRECISION,
    "actsAndSections" JSONB,
    "zeroFirReference" TEXT,
    "rawJson" JSONB,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMetadata_fileId_key" ON "DocumentMetadata"("fileId");

-- CreateIndex
CREATE INDEX "DocumentMetadata_firNumber_idx" ON "DocumentMetadata"("firNumber");

-- CreateIndex
CREATE INDEX "DocumentMetadata_district_idx" ON "DocumentMetadata"("district");

-- CreateIndex
CREATE INDEX "DocumentMetadata_subDivision_idx" ON "DocumentMetadata"("subDivision");

-- CreateIndex
CREATE INDEX "DocumentMetadata_policeStation_idx" ON "DocumentMetadata"("policeStation");

-- CreateIndex
CREATE INDEX "DocumentMetadata_firDate_idx" ON "DocumentMetadata"("firDate");

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
