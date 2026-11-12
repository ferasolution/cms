<?php

namespace App\Support;

/**
 * Sample people, places and amounts for demo communities. Pakistan keeps the original
 * Karachi flavour (Block 19); every other country gets an American-style demo.
 */
class DemoData
{
    public static function for(?string $country = null): array
    {
        $country = strtoupper($country ?: (Settings::get('country') ?: 'US'));

        return $country === 'PK' ? self::PK : self::US;
    }

    /** Scale a rupee amount from the original demo to the region (US: ~$1 per Rs 12, rounded to $5). */
    public static function amount(float $pkr, ?array $d = null): float
    {
        $d ??= self::for();

        return $d['rate'] === 1 ? $pkr : max(5, round($pkr * $d['rate'] / 5) * 5);
    }

    public static function phone(int $i, ?array $d = null): string
    {
        $d ??= self::for();

        return $d === self::PK ? '0300-'.str_pad((string) (1000000 + ($i * 7919) % 8999999), 7, '0', STR_PAD_LEFT) : sprintf('(512) 555-%04d', 100 + ($i * 37) % 9800);
    }

    public static function idNumber(int $i, ?array $d = null): string
    {
        $d ??= self::for();

        return $d === self::PK ? '42101-'.(1000000 + ($i * 7393) % 8999999).'-'.(1 + $i % 9) : 'TX DL '.str_pad((string) (10000000 + ($i * 48271) % 89999999), 8, '0', STR_PAD_LEFT);
    }

    public static function plate(int $i, ?array $d = null): string
    {
        $d ??= self::for();

        return $d === self::PK ? ['BKR', 'LEA', 'AFR', 'KHI', 'BJT'][$i % 5].'-'.(1000 + $i * 137) : ['KXR', 'LMB', 'HTD', 'PNV', 'GWZ'][$i % 5].'-'.(1000 + ($i * 7919) % 9000);
    }

    public const PK = [
        'rate' => 1,
        'first' => ['Ahmed', 'Fatima', 'Usman', 'Ayesha', 'Bilal', 'Sana', 'Hamza', 'Zainab', 'Imran', 'Hira', 'Faisal', 'Mariam', 'Kashif', 'Nadia', 'Omar', 'Rabia', 'Tariq', 'Saima', 'Adeel', 'Nida', 'Junaid', 'Amna', 'Shoaib', 'Mehwish'],
        'last' => ['Khan', 'Ali', 'Siddiqui', 'Hussain', 'Malik', 'Qureshi', 'Raza', 'Sheikh', 'Javed', 'Mirza', 'Aslam', 'Abbasi', 'Iqbal', 'Farooq', 'Anwar', 'Baig', 'Rizvi', 'Zaidi', 'Memon', 'Butt'],
        'owners' => ['Ahmed Khan', 'Fatima Ali', 'Usman Tariq', 'Ayesha Siddiqui', 'Bilal Hussain', 'Sana Malik', 'Hamza Qureshi', 'Zainab Raza', 'Imran Sheikh', 'Hira Javed', 'Faisal Mirza', 'Mariam Aslam', 'Kashif Abbasi', 'Nadia Iqbal', 'Omar Farooq', 'Rabia Anwar'],
        'staff' => ['manager' => 'Saad Manager', 'security' => 'Gate Security', 'inventory' => 'Store Keeper', 'librarian' => 'Librarian', 'finance' => 'Accounts Officer', 'hr' => 'Hina HR', 'gym' => 'Club Manager', 'guard' => 'Guard Shift B'],
        'visitor_first' => ['Ali Raza', 'Kamran', 'Shahid', 'Asif', 'Naveed', 'Tahir', 'Waqas', 'Junaid'],
        'visitor_last' => ['Ahmed', 'Butt', 'Khan', 'Shah'],
        'purposes' => ['Family visit', 'Plumbing work', 'Courier delivery', 'Dinner invitation', 'Electric repair', 'Tuition', 'House cleaning'],
        'workers' => ['Akram (Plumber)', 'Javed (Electrician)', 'Sweeper Team', 'Rafiq (Gardener)', 'Maintenance Team'],
        'issued_to' => ['Gardener Rafiq', 'Electrician Javed', 'Security Supervisor', 'Event Committee', 'Plumber Akram'],
        'issue_purpose' => ['Park maintenance', 'Street light repair', 'Night patrol', 'Community iftar', 'Water line fix'],
        'tent' => 'Shamiana Tent',
        'books' => [['Aangan', 'Khadija Mastoor', 'Urdu Novel'], ['Udaas Naslain', 'Abdullah Hussain', 'Urdu Novel'], ['Raja Gidh', 'Bano Qudsia', 'Urdu Novel'], ['Atomic Habits', 'James Clear', 'Self Help'], ['Sapiens', 'Yuval Noah Harari', 'History'], ['Clean Code', 'Robert C. Martin', 'Technology'], ['The Alchemist', 'Paulo Coelho', 'Fiction'], ['Shahab Nama', 'Qudratullah Shahab', 'Biography'], ['Pir-e-Kamil', 'Umera Ahmed', 'Urdu Novel'], ['A Brief History of Time', 'Stephen Hawking', 'Science']],
        'utility' => 'K-Electric',
        'events' => [['Walima Reception', 'wedding', 'Community Hall'], ['Birthday Party', 'birthday', 'Club Lawn'], ['Milad Mehfil', 'religious', 'Mosque Lawn'], ['Cricket Tournament', 'sports', 'Ground']],
        'courier' => 'Courier — TCS', 'plumber_visitor' => 'Imran Plumber', 'cousin' => 'Usman Cousin',
        'cars' => [['Toyota Corolla', 'White'], ['Honda Civic', 'Black'], ['Suzuki Alto', 'Silver'], ['Honda CD70', 'Red'], ['Toyota Hilux', 'Grey']],
        'employees' => ['Rafiq Gardener', 'Javed Electrician', 'Akram Plumber', 'Sweeper Team Lead'],
        'guards' => ['Nadeem Akhtar', 'Shahid Khan'],
        'domestic' => ['Shabana Bibi', 'Akbar Ali', 'Gul Muhammad', 'Rubina', 'Sajid Masih', 'Naseem Akhtar'],
        'announcement' => ['Community Milad Mehfil', 'All residents are invited to the Milad Mehfil at the Mosque lawn. Langar after Isha.'],
        'mosque' => 'Mosque', 'gate_road' => 'Rashid Minhas Road entrance',
    ];

    public const US = [
        'rate' => 0.085,
        'first' => ['James', 'Emily', 'Michael', 'Olivia', 'David', 'Sophia', 'Daniel', 'Ava', 'Matthew', 'Isabella', 'Christopher', 'Mia', 'Andrew', 'Charlotte', 'Joshua', 'Amelia', 'Ryan', 'Harper', 'Brandon', 'Evelyn', 'Tyler', 'Abigail', 'Justin', 'Ella'],
        'last' => ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White'],
        'owners' => ['James Carter', 'Emily Johnson', 'Michael Brooks', 'Olivia Martinez', 'David Thompson', 'Sophia Nguyen', 'Daniel Rivera', 'Ava Mitchell', 'Matthew Collins', 'Isabella Reed', 'Christopher Hayes', 'Mia Patel', 'Andrew Foster', 'Charlotte Kim', 'Joshua Bennett', 'Amelia Ward'],
        'staff' => ['manager' => 'Sarah Whitman', 'security' => 'Mark Delgado', 'inventory' => 'Kevin Price', 'librarian' => 'Laura Simmons', 'finance' => 'Rachel Cooper', 'hr' => 'Jessica Ortiz', 'gym' => 'Tony Russo', 'guard' => 'Derek Coleman'],
        'visitor_first' => ['Jake', 'Megan', 'Carlos', 'Ashley', 'Brian', 'Nicole', 'Eric', 'Samantha'],
        'visitor_last' => ['Turner', 'Hughes', 'Sanders', 'Price'],
        'purposes' => ['Family visit', 'Plumbing repair', 'Package delivery', 'Dinner party', 'HVAC service', 'Tutoring', 'House cleaning'],
        'workers' => ['Mike Reynolds (Plumber)', 'Dave Carter (Electrician)', 'Janitorial Team', 'Luis Moreno (Landscaping)', 'Maintenance Team'],
        'issued_to' => ['Landscaping crew', 'Dave Carter (Electrician)', 'Security Supervisor', 'Social Committee', 'Mike Reynolds (Plumber)'],
        'issue_purpose' => ['Park maintenance', 'Street light repair', 'Night patrol', 'Fall festival', 'Irrigation line fix'],
        'tent' => 'Party Tent 20x30',
        'books' => [['Where the Crawdads Sing', 'Delia Owens', 'Fiction'], ['Educated', 'Tara Westover', 'Memoir'], ['The Midnight Library', 'Matt Haig', 'Fiction'], ['Atomic Habits', 'James Clear', 'Self Help'], ['Sapiens', 'Yuval Noah Harari', 'History'], ['Clean Code', 'Robert C. Martin', 'Technology'], ['The Alchemist', 'Paulo Coelho', 'Fiction'], ['Becoming', 'Michelle Obama', 'Biography'], ['Lessons in Chemistry', 'Bonnie Garmus', 'Fiction'], ['A Brief History of Time', 'Stephen Hawking', 'Science']],
        'utility' => 'City Power & Light',
        'events' => [['Wedding Reception', 'wedding', 'Clubhouse'], ['Birthday Party', 'birthday', 'Pool Deck'], ['Fall Festival', 'community', 'Community Park'], ['Pickleball Tournament', 'sports', 'Sports Courts']],
        'courier' => 'Package — UPS', 'plumber_visitor' => 'Roto-Rooter Technician', 'cousin' => 'Jake (Cousin)',
        'cars' => [['Toyota Camry', 'White'], ['Ford F-150', 'Black'], ['Honda CR-V', 'Silver'], ['Harley-Davidson', 'Red'], ['Tesla Model Y', 'Grey']],
        'employees' => ['Luis Moreno (Landscaping)', 'Dave Carter (Electrician)', 'Mike Reynolds (Plumber)', 'Janitorial Lead'],
        'guards' => ['Marcus Hill', 'Tyrone Jenkins'],
        'domestic' => ['Maria Lopez', 'Robert King', 'Jose Hernandez', 'Linda Scott', 'Paul Baker', 'Grace Young'],
        'announcement' => ['Fall Festival this Saturday', 'Join your neighbors at Community Park from 4 PM: food trucks, live music and games for the kids.'],
        'mosque' => 'Clubhouse', 'gate_road' => 'Main entrance (Maple Grove Blvd)',
    ];
}
